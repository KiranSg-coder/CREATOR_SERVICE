const { QueryTypes } = require("sequelize");
const sequelize = require("../config/database");
const { toNum } = require("../lib/normalize");

const getAdminCreatorStats = async (req, res) => {
  try {
    const result = await sequelize.query(
      `EXEC USP_ADMIN_CREATOR_SUMMARY`,
      { type: QueryTypes.SELECT }
    );

    const r = result[0] || {};
    return res.status(200).json({
      success: true,
      data: {
        totalCreators: toNum(r.TOTALCREATORS) ?? 0,
        activeCreators: toNum(r.ACTIVECREATORS) ?? 0,
        totalCourses: toNum(r.TOTALCOURSES) ?? 0,
        pendingApplications: toNum(r.PENDINGAPPLICATIONS) ?? 0,
      },
    });
  } catch (error) {
    console.error("getAdminCreatorStats error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const getAdminTopCreators = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;

    const result = await sequelize.query(
      `EXEC USP_ADMIN_CREATOR_TOP @LIMIT=:limit`,
      {
        replacements: { limit },
        type: QueryTypes.SELECT,
      }
    );

    const items = (result || []).map((r) => ({
      creatorUserId: toNum(r.CREATORUSERID),
      displayName: r.DISPLAYNAME ?? null,
      publishedPlans: toNum(r.PUBLISHEDPLANS) ?? 0,
      enrollmentCount: toNum(r.ENROLLMENTCOUNT) ?? 0,
    }));

    return res.status(200).json({
      success: true,
      data: items,
    });
  } catch (error) {
    console.error("getAdminTopCreators error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  getAdminCreatorStats,
  getAdminTopCreators,
};
