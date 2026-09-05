const { QueryTypes } = require("sequelize");
const axios = require("axios");
const sequelize = require("../config/database");
const { buildCsv, buildXlsxBuffer } = require("../services/importTemplate");
const { processImportBuffer } = require("../services/importRunner");
const { importJobFromRow } = require("../lib/normalize");

const FILE_DOCUMENT_BASE_URL =
  process.env.FILE_DOCUMENT_BASE_URL || "http://localhost:6008";

async function createJobRow(planId, userId, inputFileUuid) {
  const result = await sequelize.query(
    `EXEC USP_IMPORT_JOB_CREATE
      @PLANID=:planId,
      @CREATORUSERID=:userId,
      @INPUTFILEUUID=:inputFileUuid`,
    {
      replacements: {
        planId,
        userId,
        inputFileUuid: inputFileUuid || null,
      },
      type: QueryTypes.SELECT,
    }
  );
  return result[0];
}

async function downloadFromFileService(fileUuid, authHeader) {
  const url = `${FILE_DOCUMENT_BASE_URL.replace(/\/$/, "")}/files/${fileUuid}/download`;
  const headers = {};
  if (authHeader) headers.Authorization = authHeader;
  const resp = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60000,
    headers,
    validateStatus: () => true,
  });
  if (resp.status >= 400) {
    throw new Error(
      `Could not download file ${fileUuid} from File Document Service (HTTP ${resp.status})`
    );
  }
  const disposition = resp.headers["content-disposition"] || "";
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  const filename = match ? match[1] : `${fileUuid}.bin`;
  const mimetype = resp.headers["content-type"] || "";
  return {
    buffer: Buffer.from(resp.data),
    filename,
    mimetype,
  };
}

const downloadCsvTemplate = async (_req, res) => {
  try {
    const csv = buildCsv();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="streakly_plan_import_template.csv"'
    );
    return res.status(200).send(csv);
  } catch (error) {
    console.error("downloadCsvTemplate error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const downloadXlsxTemplate = async (_req, res) => {
  try {
    const buf = await buildXlsxBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="streakly_plan_import_template.xlsx"'
    );
    return res.status(200).send(buf);
  } catch (error) {
    console.error("downloadXlsxTemplate error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

/**
 * POST /me/plans/:planId/import-jobs
 * Body JSON: { inputFileUuid | fileUuid, mode? }
 * OR multipart: field "file" (+ optional mode)
 *
 * Processes synchronously for v1 so the UI can show success/errors immediately;
 * job row still supports polling.
 */
const createImportJob = async (req, res) => {
  try {
    const planId = parseInt(req.params.planId, 10);
    if (!Number.isFinite(planId)) {
      return res
        .status(400)
        .json({ success: false, message: "planId must be a number" });
    }

    const mode = String(
      req.body?.mode || req.query?.mode || "REPLACE"
    )
      .trim()
      .toUpperCase();

    let buffer = null;
    let filename = null;
    let mimetype = null;
    let inputFileUuid = null;

    if (req.file && req.file.buffer) {
      buffer = req.file.buffer;
      filename = req.file.originalname || "upload.bin";
      mimetype = req.file.mimetype || "";
    } else {
      inputFileUuid =
        (req.body?.inputFileUuid && String(req.body.inputFileUuid).trim()) ||
        (req.body?.fileUuid && String(req.body.fileUuid).trim()) ||
        null;

      if (!inputFileUuid) {
        return res.status(400).json({
          success: false,
          message:
            "Provide a spreadsheet as multipart field 'file', or JSON { inputFileUuid } from File Document Service",
        });
      }

      try {
        const downloaded = await downloadFromFileService(
          inputFileUuid,
          req.headers.authorization
        );
        buffer = downloaded.buffer;
        filename = downloaded.filename;
        mimetype = downloaded.mimetype;
      } catch (dlErr) {
        return res.status(400).json({
          success: false,
          message: dlErr.message,
        });
      }
    }

    const jobRow = await createJobRow(planId, req.userId, inputFileUuid);
    if (!jobRow || jobRow.SUCCESS === 0) {
      return res.status(400).json({
        success: false,
        message: jobRow?.MESSAGE || "Create import job failed",
      });
    }

    const jobId = Number(jobRow.JOBID);
    const outcome = await processImportBuffer({
      jobId,
      planId,
      userId: req.userId,
      buffer,
      filename,
      mimetype,
      mode: mode === "MERGE" ? "MERGE" : "REPLACE",
    });

    const statusCode = outcome.status === "SUCCEEDED" ? 201 : 400;
    return res.status(statusCode).json({
      success: outcome.status === "SUCCEEDED",
      data: {
        jobId,
        status: outcome.status,
        totalRows: outcome.totalRows,
        successRows: outcome.successRows,
        failRows: outcome.failRows,
        dayCount: outcome.dayCount,
        slotCount: outcome.slotCount,
        durationDays: outcome.durationDays,
        errors: outcome.errors || [],
        mode: outcome.mode || mode,
      },
      message:
        outcome.status === "SUCCEEDED"
          ? "Import completed"
          : "Import failed — see errors",
    });
  } catch (error) {
    console.error("createImportJob error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const getImportJob = async (req, res) => {
  try {
    const { planId, jobId } = req.params;
    const pid = parseInt(planId, 10);
    const jid = parseInt(jobId, 10);

    const result = await sequelize.query(
      `EXEC USP_IMPORT_JOB_GET @JOBID=:jobId, @CREATORUSERID=:userId`,
      {
        replacements: { jobId: jid, userId: req.userId },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0] || null;
    if (!row) {
      return res
        .status(404)
        .json({ success: false, message: "Import job not found" });
    }
    if (row.SUCCESS === 0) {
      return res
        .status(403)
        .json({ success: false, message: row.MESSAGE || "Access denied" });
    }

    const job = importJobFromRow(row);
    if (job.planId !== pid) {
      return res.status(404).json({
        success: false,
        message: "Import job not found for this plan",
      });
    }

    let resultJson = job.resultJson;
    if (typeof resultJson === "string") {
      try {
        resultJson = JSON.parse(resultJson);
      } catch {
        /* keep string */
      }
    }

    return res.status(200).json({
      success: true,
      data: { ...job, resultJson },
    });
  } catch (error) {
    console.error("getImportJob error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  createImportJob,
  getImportJob,
  downloadCsvTemplate,
  downloadXlsxTemplate,
};
