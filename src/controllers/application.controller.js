const { QueryTypes } = require("sequelize");
const sequelize = require("../config/database");
const { applicationFromRow } = require("../lib/normalize");
const {
  tenantFromReq,
  syncCreatorRolesOnApprove,
} = require("../lib/authzSync");
const eventPublisher = require("../utils/eventPublisher");
const { EVENT_TYPES, EVENT_CATEGORIES } = require("../config/eventTypes");

const REVIEW_ACTIONS = new Set(["APPROVE", "REJECT", "REQUEST_INFO"]);

/** SQL Server BIT / int SUCCESS → failed? */
function spFailed(row) {
  if (!row) return true;
  const s = row.SUCCESS;
  return s === 0 || s === false || s === "0";
}

async function fetchApplicationRow(applicationId) {
  const result = await sequelize.query(
    `EXEC USP_CREATOR_APP_GET_BY_ID @APPLICATIONID=:applicationId`,
    {
      replacements: { applicationId: parseInt(applicationId, 10) },
      type: QueryTypes.SELECT,
    },
  );
  return result[0] || null;
}

function creatorListItemFromRow(r) {
  if (!r) return null;
  const app = applicationFromRow(r);
  return {
    ...app,
    displayName:
      r.PROFILEDISPLAYNAME ||
      r.profileDisplayName ||
      app?.displayNamePref ||
      null,
    profileBio: r.PROFILEBIO ?? r.profileBio ?? app?.bioDraft ?? null,
    publicEmail: r.PROFILEPUBLICEMAIL ?? r.profilePublicEmail ?? null,
    profileStatus: r.PROFILESTATUS ?? r.profileStatus ?? null,
    isVerifiedBadge: r.ISVERIFIEDBADGE != null ? Boolean(r.ISVERIFIEDBADGE) : null,
    planCount: r.PLANCOUNT != null ? Number(r.PLANCOUNT) : 0,
    approvedAt: app?.reviewedAt || null,
  };
}

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
      },
    );

    const row = result[0];
    if (spFailed(row)) {
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
      },
    );

    const row = result[0];
    if (spFailed(row)) {
      return res
        .status(400)
        .json({ success: false, message: row?.MESSAGE || "Submit failed" });
    }

    const applicationId = Number(row.APPLICATIONID);
    eventPublisher
      .publish(
        EVENT_TYPES.CREATOR_APP_SUBMITTED,
        EVENT_CATEGORIES.CREATOR,
        {
          userId: Number(req.userId),
          applicationId,
        },
        { entityId: String(applicationId) },
      )
      .catch(() => {});

    return res.status(200).json({
      success: true,
      data: { applicationId },
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
      },
    );

    const row = result[0] || null;
    const data = applicationFromRow(row);

    // Lazy reconcile: approved apps always re-ensure Creator role stack so the
    // applicant does not need a manual re-login after admin approval.
    if (data?.status === "APPROVED" && req.userId) {
      syncCreatorRolesOnApprove({
        userId: Number(req.userId),
        ...tenantFromReq(req),
      }).catch((err) =>
        console.warn(
          "[Creator] lazy role reconcile failed:",
          err?.message || err,
        ),
      );
    }

    return res.status(200).json({
      success: true,
      data,
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
    const id = parseInt(applicationId, 10);

    // Mark SUBMITTED → UNDER_REVIEW when an admin opens the detail view.
    try {
      await sequelize.query(
        `EXEC USP_CREATOR_APP_MARK_UNDER_REVIEW @APPLICATIONID=:applicationId`,
        {
          replacements: { applicationId: id },
          type: QueryTypes.SELECT,
        },
      );
    } catch (markErr) {
      // SP may not be applied yet — fall back to get-by-id only.
      console.warn(
        "mark under review skipped:",
        markErr.message,
      );
    }

    const row = await fetchApplicationRow(id);
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

/** Legacy pending queue — kept for older clients. */
const listPending = async (req, res) => {
  req.query = { ...req.query, status: "QUEUE" };
  return listApplications(req, res);
};

/**
 * Admin list with search / status / sort.
 * Query: status, search, sortBy, sortDir, page, pageSize
 */
const listApplications = async (req, res) => {
  try {
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const page = parseInt(req.query.page, 10) || 1;
    const statusFilter = String(req.query.status || "QUEUE").trim().toUpperCase();
    const search = req.query.search != null ? String(req.query.search) : null;
    const sortBy = String(req.query.sortBy || "SUBMITTEDAT").trim().toUpperCase();
    const sortDir = String(req.query.sortDir || "ASC").trim().toUpperCase();

    let result;
    try {
      result = await sequelize.query(
        `EXEC USP_CREATOR_APP_ADMIN_LIST
          @STATUSFILTER=:statusFilter,
          @SEARCH=:search,
          @SORTBY=:sortBy,
          @SORTDIR=:sortDir,
          @PAGESIZE=:pageSize,
          @PAGENUMBER=:page`,
        {
          replacements: {
            statusFilter,
            search,
            sortBy,
            sortDir,
            pageSize,
            page,
          },
          type: QueryTypes.SELECT,
        },
      );
    } catch (spErr) {
      // Fallback if new SP not deployed yet.
      console.warn(
        "USP_CREATOR_APP_ADMIN_LIST unavailable, using LIST_PENDING:",
        spErr.message,
      );
      result = await sequelize.query(
        `EXEC USP_CREATOR_APP_LIST_PENDING
          @PAGESIZE=:pageSize,
          @PAGENUMBER=:page`,
        {
          replacements: { pageSize, page },
          type: QueryTypes.SELECT,
        },
      );
    }

    const rows = result || [];
    const total = rows.length > 0 ? Number(rows[0].TOTALCOUNT ?? rows.length) : 0;
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
    console.error("listApplications error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const reviewApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { action, reviewedByUserId, reviewNote, rejectionReason } = req.body;

    const normalizedAction =
      action != null ? String(action).trim().toUpperCase() : "";
    if (!REVIEW_ACTIONS.has(normalizedAction)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Use APPROVE, REJECT, or REQUEST_INFO",
      });
    }

    const note =
      reviewNote != null && String(reviewNote).trim() !== ""
        ? String(reviewNote).trim()
        : null;
    const reason =
      rejectionReason != null && String(rejectionReason).trim() !== ""
        ? String(rejectionReason).trim()
        : note;

    if (normalizedAction === "REJECT" && !reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }
    if (normalizedAction === "REQUEST_INFO" && !note) {
      return res.status(400).json({
        success: false,
        message: "A message is required when requesting more information",
      });
    }

    const reviewerId =
      reviewedByUserId || parseInt(req.headers["x-user-id"], 10);
    if (!reviewerId || Number.isNaN(Number(reviewerId))) {
      return res.status(400).json({
        success: false,
        message: "reviewedByUserId is required",
      });
    }

    const before = await fetchApplicationRow(applicationId);
    if (!before) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

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
          action: normalizedAction,
          reviewerId: Number(reviewerId),
          reviewNote: note,
          rejectionReason:
            normalizedAction === "REJECT" ? reason : null,
        },
        type: QueryTypes.SELECT,
      },
    );

    const row = result[0];
    if (spFailed(row)) {
      return res
        .status(400)
        .json({ success: false, message: row?.MESSAGE || "Review failed" });
    }

    const appUserId = Number(row.USERID ?? before.USERID);
    const newStatus = row.STATUS ?? null;
    let authzSync = null;

    if (normalizedAction === "APPROVE" && appUserId) {
      try {
        authzSync = await syncCreatorRolesOnApprove({
          userId: appUserId,
          ...tenantFromReq(req),
        });
      } catch (syncErr) {
        console.error("Creator AuthZ sync error:", syncErr.message);
        authzSync = { ok: false, error: syncErr.message };
      }
    }

    const eventType =
      normalizedAction === "APPROVE"
        ? EVENT_TYPES.CREATOR_APP_APPROVED
        : normalizedAction === "REJECT"
          ? EVENT_TYPES.CREATOR_APP_REJECTED
          : EVENT_TYPES.CREATOR_APP_REQUEST_INFO;

    eventPublisher
      .publish(
        eventType,
        EVENT_CATEGORIES.CREATOR,
        {
          userId: appUserId,
          applicationId: Number(applicationId),
          status: newStatus,
          reviewNote: note,
          rejectionReason: normalizedAction === "REJECT" ? reason : null,
          displayNamePref: before.DISPLAYNAMEPREF || null,
        },
        { entityId: String(applicationId) },
      )
      .catch(() => {});

    const roleWarning =
      normalizedAction === "APPROVE" && authzSync && authzSync.ok === false
        ? authzSync.error || "CREATOR_USER role sync failed"
        : null;

    return res.status(200).json({
      success: true,
      data: {
        applicationId: Number(applicationId),
        userId: appUserId,
        status: newStatus,
        authzSync,
        roleWarning,
      },
      message: roleWarning
        ? `${row.MESSAGE}. Warning: ${roleWarning}`
        : row.MESSAGE,
    });
  } catch (error) {
    console.error("reviewApplication error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

/** Re-run AuthZ role stack for an approved application (admin repair). */
const resyncRoles = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const row = await fetchApplicationRow(applicationId);
    if (!row) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }
    if (String(row.STATUS || "").toUpperCase() !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message: "Role resync is only available for APPROVED applications",
      });
    }
    const userId = Number(row.USERID);
    const authzSync = await syncCreatorRolesOnApprove({
      userId,
      ...tenantFromReq(req),
    });
    return res.status(200).json({
      success: !!authzSync?.ok,
      data: { applicationId: Number(applicationId), userId, authzSync },
      message: authzSync?.ok
        ? "Creator roles synced"
        : authzSync?.error || "Role sync failed",
    });
  } catch (error) {
    console.error("resyncRoles error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

/** Admin list of approved creators (profile + application). */
const listCreators = async (req, res) => {
  try {
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const page = parseInt(req.query.page, 10) || 1;
    const search = req.query.search != null ? String(req.query.search) : null;
    const sortBy = String(req.query.sortBy || "REVIEWEDAT").trim().toUpperCase();
    const sortDir = String(req.query.sortDir || "DESC").trim().toUpperCase();

    let result;
    try {
      result = await sequelize.query(
        `EXEC USP_CREATOR_ADMIN_CREATORS_LIST
          @SEARCH=:search,
          @SORTBY=:sortBy,
          @SORTDIR=:sortDir,
          @PAGESIZE=:pageSize,
          @PAGENUMBER=:page`,
        {
          replacements: { search, sortBy, sortDir, pageSize, page },
          type: QueryTypes.SELECT,
        },
      );
    } catch (spErr) {
      console.warn(
        "USP_CREATOR_ADMIN_CREATORS_LIST unavailable, using APPROVED filter:",
        spErr.message,
      );
      result = await sequelize.query(
        `EXEC USP_CREATOR_APP_ADMIN_LIST
          @STATUSFILTER=N'APPROVED',
          @SEARCH=:search,
          @SORTBY=:sortBy,
          @SORTDIR=:sortDir,
          @PAGESIZE=:pageSize,
          @PAGENUMBER=:page`,
        {
          replacements: {
            search,
            sortBy: sortBy === "REVIEWEDAT" ? "UPDATEDDATE" : sortBy,
            sortDir,
            pageSize,
            page,
          },
          type: QueryTypes.SELECT,
        },
      );
    }

    const rows = result || [];
    const total = rows.length > 0 ? Number(rows[0].TOTALCOUNT ?? rows.length) : 0;
    const items = rows.map((r) => {
      const { TOTALCOUNT: _t, ...rest } = r;
      return creatorListItemFromRow(rest);
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
    console.error("listCreators error:", error.message);
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
  listApplications,
  listCreators,
  reviewApplication,
  resyncRoles,
};
