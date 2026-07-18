const { QueryTypes } = require("sequelize");
const sequelize = require("../config/database");
const { reportFromRow } = require("../lib/normalize");

const listOpenReports = async (req, res) => {
  try {
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const page = parseInt(req.query.page, 10) || 1;

    const result = await sequelize.query(
      `EXEC USP_PLAN_REPORT_LIST_OPEN @PAGESIZE=:pageSize, @PAGENUMBER=:page`,
      {
        replacements: { pageSize, page },
        type: QueryTypes.SELECT,
      }
    );

    const rows = result || [];
    const total = rows.length > 0 ? rows[0].TOTALCOUNT ?? rows.length : 0;
    const items = rows.map((r) => {
      const { TOTALCOUNT: _t, ...rest } = r;
      return reportFromRow(rest);
    });

    return res.status(200).json({
      success: true,
      data: items,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("listOpenReports error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const resolveReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { newStatus, resolution, resolvedByUserId } = req.body;

    const reviewerId =
      resolvedByUserId || parseInt(req.headers["x-user-id"], 10);

    const statusVal = (newStatus || resolution || "")
      .toString()
      .trim()
      .toUpperCase();

    const result = await sequelize.query(
      `EXEC USP_PLAN_REPORT_RESOLVE
        @REPORTID=:reportId,
        @RESOLVEDBYUSERID=:reviewerId,
        @NEWSTATUS=:newStatus`,
      {
        replacements: {
          reportId: parseInt(reportId, 10),
          reviewerId,
          newStatus: statusVal || null,
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res
        .status(400)
        .json({ success: false, message: row?.MESSAGE || "Resolve failed" });
    }
    return res.status(200).json({
      success: true,
      data: { reportId: Number(reportId), status: statusVal },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("resolveReport error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  listOpenReports,
  resolveReport,
};
