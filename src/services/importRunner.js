/**
 * Process an import job: parse buffer → validate → APPLY (replace mode) →
 * sync DURATIONDAYS → update job status.
 */

const { QueryTypes } = require("sequelize");
const sequelize = require("../config/database");
const { parseImportFile } = require("./importParser");
const { importJobFromRow } = require("../lib/normalize");

async function updateJobStatus({
  jobId,
  jobStatus,
  totalRows,
  successRows,
  failRows,
  resultJson,
}) {
  await sequelize.query(
    `EXEC USP_IMPORT_JOB_UPDATE_STATUS
      @JOBID=:jobId,
      @JOBSTATUS=:jobStatus,
      @TOTALROWS=:totalRows,
      @SUCCESSROWS=:successRows,
      @FAILROWS=:failRows,
      @RESULTJSON=:resultJson`,
    {
      replacements: {
        jobId,
        jobStatus,
        totalRows: totalRows != null ? totalRows : null,
        successRows: successRows != null ? successRows : null,
        failRows: failRows != null ? failRows : null,
        resultJson:
          resultJson != null
            ? typeof resultJson === "string"
              ? resultJson
              : JSON.stringify(resultJson)
            : null,
      },
      type: QueryTypes.SELECT,
    }
  );
}

async function getJob(jobId, userId) {
  const result = await sequelize.query(
    `EXEC USP_IMPORT_JOB_GET @JOBID=:jobId, @CREATORUSERID=:userId`,
    {
      replacements: { jobId, userId },
      type: QueryTypes.SELECT,
    }
  );
  const row = result[0];
  if (!row || row.SUCCESS === 0) return null;
  return importJobFromRow(row);
}

/**
 * Apply nested days JSON into a draft plan (replace current version curriculum).
 */
async function applyRows({ planId, userId, days, mode = "REPLACE" }) {
  const result = await sequelize.query(
    `EXEC USP_IMPORT_ROWS_APPLY
      @PLANID=:planId,
      @CREATORUSERID=:userId,
      @ROWSJSON=:rowsJson,
      @MODE=:mode`,
    {
      replacements: {
        planId,
        userId,
        rowsJson: JSON.stringify(days),
        mode,
      },
      type: QueryTypes.SELECT,
    }
  );
  return result[0] || null;
}

/**
 * Process a buffer against an existing job / plan.
 * Fail-fast on validation errors (no partial apply) so creators get a clean retry.
 */
async function processImportBuffer({
  jobId,
  planId,
  userId,
  buffer,
  filename,
  mimetype,
  mode = "REPLACE",
}) {
  await updateJobStatus({
    jobId,
    jobStatus: "PROCESSING",
    totalRows: null,
    successRows: null,
    failRows: null,
    resultJson: null,
  });

  let parsed;
  try {
    parsed = await parseImportFile(buffer, { filename, mimetype });
  } catch (err) {
    const resultJson = {
      errors: [{ row: 0, field: null, message: err.message || "Parse failed" }],
    };
    await updateJobStatus({
      jobId,
      jobStatus: "FAILED",
      totalRows: 0,
      successRows: 0,
      failRows: 1,
      resultJson,
    });
    return { status: "FAILED", ...resultJson, totalRows: 0, successRows: 0, failRows: 1 };
  }

  if (!parsed.days.length || parsed.errors.length > 0) {
    const status = parsed.days.length === 0 ? "FAILED" : "FAILED";
    const resultJson = {
      errors: parsed.errors.length
        ? parsed.errors
        : [{ row: 0, field: null, message: "No valid rows found in file" }],
      dayCount: parsed.days.length,
    };
    await updateJobStatus({
      jobId,
      jobStatus: status,
      totalRows: parsed.totalRows,
      successRows: 0,
      failRows: parsed.failRows || parsed.totalRows || 1,
      resultJson,
    });
    return {
      status,
      errors: resultJson.errors,
      totalRows: parsed.totalRows,
      successRows: 0,
      failRows: parsed.failRows || 1,
    };
  }

  const applyRow = await applyRows({
    planId,
    userId,
    days: parsed.days,
    mode,
  });

  if (!applyRow || applyRow.SUCCESS === 0) {
    const resultJson = {
      errors: [
        {
          row: 0,
          field: null,
          message: applyRow?.MESSAGE || "Database apply failed",
        },
      ],
    };
    await updateJobStatus({
      jobId,
      jobStatus: "FAILED",
      totalRows: parsed.totalRows,
      successRows: 0,
      failRows: parsed.totalRows,
      resultJson,
    });
    return {
      status: "FAILED",
      errors: resultJson.errors,
      totalRows: parsed.totalRows,
      successRows: 0,
      failRows: parsed.totalRows,
    };
  }

  const resultJson = {
    dayCount: Number(applyRow.DAYCOUNT ?? parsed.days.length),
    slotCount: Number(applyRow.SLOTCOUNT ?? 0),
    durationDays: Number(applyRow.DURATIONDAYS ?? parsed.days.length),
    mode: applyRow.MODE || mode,
    errors: [],
  };

  await updateJobStatus({
    jobId,
    jobStatus: "SUCCEEDED",
    totalRows: parsed.totalRows,
    successRows: parsed.successRows,
    failRows: 0,
    resultJson,
  });

  return {
    status: "SUCCEEDED",
    ...resultJson,
    totalRows: parsed.totalRows,
    successRows: parsed.successRows,
    failRows: 0,
  };
}

module.exports = {
  updateJobStatus,
  getJob,
  applyRows,
  processImportBuffer,
};
