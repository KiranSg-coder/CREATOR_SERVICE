const { QueryTypes } = require("sequelize");
const sequelize = require("../config/database");
const { applicationFromRow } = require("../lib/normalize");

const saveDraft = async (req, res) => {
  try {
    const {
      displayNamePref,
      bioDraft,
      motivation,
      sampleOutline,
      portfolioLinks,
      agreementAccepted,
    } = req.body;

    const result = await sequelize.query(
      `EXEC USP_CREATOR_APP_SAVE_DRAFT
        @USERID=:userId,
        @DISPLAYNAMEPREF=:displayNamePref,
        @BIODRAFT=:bioDraft,
        @MOTIVATION=:motivation,
        @SAMPLEOUTLINE=:sampleOutline,
        @PORTFOLIOLINKS=:portfolioLinks,
        @AGREEMENTACCEPTED=:agreementAccepted`,
      {
        replacements: {
          userId: req.userId,
          displayNamePref:
            displayNamePref != null && String(displayNamePref).trim() !== ""
              ? String(displayNamePref).trim()
              : null,
          bioDraft:
            bioDraft != null && String(bioDraft).trim() !== ""
              ? String(bioDraft).trim()
              : null,
          motivation:
            motivation != null && String(motivation).trim() !== ""
              ? String(motivation).trim()
              : null,
          sampleOutline:
            sampleOutline != null && String(sampleOutline).trim() !== ""
              ? String(sampleOutline).trim()
              : null,
          portfolioLinks:
            portfolioLinks != null
              ? Array.isArray(portfolioLinks)
                ? portfolioLinks.join("\n")
                : String(portfolioLinks)
              : null,
          agreementAccepted: agreementAccepted ? 1 : 0,
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res
        .status(400)
        .json({ success: false, message: row?.MESSAGE || "Save failed" });
    }
    return res.status(200).json({
      success: true,
      data: { applicationId: Number(row.APPLICATIONID) },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("saveDraft error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const submitApplication = async (req, res) => {
  try {
    const { autoEligibilityJson } = req.body;

    const result = await sequelize.query(
      `EXEC USP_CREATOR_APP_SUBMIT
        @USERID=:userId,
        @AUTOELIGIBILITYJSON=:autoEligibilityJson`,
      {
        replacements: {
          userId: req.userId,
          autoEligibilityJson: autoEligibilityJson
            ? typeof autoEligibilityJson === "string"
              ? autoEligibilityJson
              : JSON.stringify(autoEligibilityJson)
            : null,
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res
        .status(400)
        .json({ success: false, message: row?.MESSAGE || "Submit failed" });
    }
    return res.status(200).json({
      success: true,
      data: { applicationId: Number(row.APPLICATIONID) },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("submitApplication error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const getMyApplication = async (req, res) => {
  try {
    const result = await sequelize.query(
      `EXEC USP_CREATOR_APP_GET_BY_USER @USERID=:userId`,
      {
        replacements: { userId: req.userId },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0] || null;
    return res.status(200).json({
      success: true,
      data: applicationFromRow(row),
    });
  } catch (error) {
    console.error("getMyApplication error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const getById = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const result = await sequelize.query(
      `EXEC USP_CREATOR_APP_GET_BY_ID @APPLICATIONID=:applicationId`,
      {
        replacements: { applicationId: parseInt(applicationId, 10) },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0] || null;
    if (!row) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }
    return res
      .status(200)
      .json({ success: true, data: applicationFromRow(row) });
  } catch (error) {
    console.error("getById error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const listPending = async (req, res) => {
  try {
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const page = parseInt(req.query.page, 10) || 1;

    const result = await sequelize.query(
      `EXEC USP_CREATOR_APP_LIST_PENDING
        @PAGESIZE=:pageSize,
        @PAGENUMBER=:page`,
      {
        replacements: { pageSize, page },
        type: QueryTypes.SELECT,
      }
    );

    const rows = result || [];
    const total = rows.length > 0 ? rows[0].TOTALCOUNT ?? rows.length : 0;
    const items = rows.map((r) => {
      const { TOTALCOUNT: _t, ...rest } = r;
      return applicationFromRow(rest);
    });

    return res.status(200).json({
      success: true,
      data: items,
      items,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("listPending error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const reviewApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { action, reviewedByUserId, reviewNote, rejectionReason } = req.body;

    const reviewerId =
      reviewedByUserId || parseInt(req.headers["x-user-id"], 10);

    const result = await sequelize.query(
      `EXEC USP_CREATOR_APP_REVIEW
        @APPLICATIONID=:applicationId,
        @ACTION=:action,
        @REVIEWEDBYUSERID=:reviewerId,
        @REVIEWNOTE=:reviewNote,
        @REJECTIONREASON=:rejectionReason`,
      {
        replacements: {
          applicationId: parseInt(applicationId, 10),
          action:
            action != null ? String(action).trim().toUpperCase() : null,
          reviewerId,
          reviewNote: reviewNote != null ? String(reviewNote) : null,
          rejectionReason:
            rejectionReason != null ? String(rejectionReason) : null,
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res
        .status(400)
        .json({ success: false, message: row?.MESSAGE || "Review failed" });
    }
    return res.status(200).json({
      success: true,
      data: {
        applicationId: Number(applicationId),
        status: row.STATUS ?? null,
      },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("reviewApplication error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  saveDraft,
  submitApplication,
  getMyApplication,
  getById,
  listPending,
  reviewApplication,
};
