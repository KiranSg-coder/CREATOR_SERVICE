const { QueryTypes } = require("sequelize");
const sequelize = require("../config/database");

const SLOT_TYPE_ALIAS = {
  READING: "THEORY",
  THEORY: "THEORY",
  PRACTICE: "PRACTICE",
  REVISION: "REVISION",
  QUIZ: "QUIZ",
  ASSIGNMENT: "ASSIGNMENT",
  PROJECT: "PROJECT",
  CUSTOM: "CUSTOM",
};

function normaliseSlotType(v) {
  if (v == null || String(v).trim() === "") return null;
  const key = String(v).trim().toUpperCase();
  return SLOT_TYPE_ALIAS[key] || key;
}

function toIntOrNull(v) {
  if (v == null || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

const upsertDay = async (req, res) => {
  try {
    const { planId, dayId } = req.params;
    const { dayNumber, title, notes } = req.body;

    const pid = parseInt(planId, 10);
    if (!Number.isFinite(pid)) {
      return res
        .status(400)
        .json({ success: false, message: "planId must be a number" });
    }

    const result = await sequelize.query(
      `EXEC USP_STUDY_PLAN_DAY_UPSERT
        @PLANID=:planId,
        @CREATORUSERID=:userId,
        @DAYID=:dayId,
        @DAYNUMBER=:dayNumber,
        @TITLE=:title,
        @NOTES=:notes`,
      {
        replacements: {
          planId: pid,
          userId: req.userId,
          dayId: dayId ? parseInt(dayId, 10) : null,
          dayNumber: toIntOrNull(dayNumber),
          title: title != null ? String(title) : null,
          notes: notes != null ? String(notes) : null,
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res
        .status(400)
        .json({ success: false, message: row?.MESSAGE || "Upsert day failed" });
    }
    return res.status(200).json({
      success: true,
      data: {
        dayId: Number(row.DAYID),
        dayNumber:
          row.DAYNUMBER != null ? Number(row.DAYNUMBER) : undefined,
      },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("upsertDay error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const deleteDay = async (req, res) => {
  try {
    const { planId, dayId } = req.params;

    const result = await sequelize.query(
      `EXEC USP_STUDY_PLAN_DAY_DELETE
        @PLANID=:planId,
        @CREATORUSERID=:userId,
        @DAYID=:dayId`,
      {
        replacements: {
          planId: parseInt(planId, 10),
          userId: req.userId,
          dayId: parseInt(dayId, 10),
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res.status(400).json({
        success: false,
        message: row?.MESSAGE || "Delete day failed",
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        dayId: Number(dayId),
        deletedSlotCount: Number(row.DELETEDSLOTCOUNT ?? 0),
      },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("deleteDay error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const upsertSlot = async (req, res) => {
  try {
    const { planId, dayId: dayIdParam, slotId } = req.params;
    const dayIdBody = req.body.dayId;
    const dayIdNum = (() => {
      if (dayIdParam != null && String(dayIdParam).trim() !== "")
        return parseInt(dayIdParam, 10);
      if (dayIdBody != null && String(dayIdBody).trim() !== "")
        return parseInt(dayIdBody, 10);
      return NaN;
    })();
    // When editing an existing slot we don't require dayId in the request —
    // the SP can look it up from the slot itself.
    if (!slotId && !Number.isFinite(dayIdNum)) {
      return res.status(400).json({
        success: false,
        message:
          "dayId is required (URL for POST …/days/:dayId/slots, or body for PATCH …/slots/:slotId)",
      });
    }

    const {
      slotType,
      title,
      description,
      content,
      estimatedMinutes,
      sortOrder,
      topicId,
      contentId,
      contentFileUuid,
      externalUrl,
      quizJson,
      requiresReview,
      reviewMethod,
      reviewDifficulty,
      estimatedRecallMinutes,
      reviewTemplate,
      reviewConfigJson,
    } = req.body;

    const quizJsonStr =
      quizJson != null
        ? typeof quizJson === "string"
          ? quizJson
          : JSON.stringify(quizJson)
        : null;

    const reviewConfigStr =
      reviewConfigJson != null
        ? typeof reviewConfigJson === "string"
          ? reviewConfigJson
          : JSON.stringify(reviewConfigJson)
        : null;

    const descriptionValue =
      description != null && String(description).trim() !== ""
        ? String(description)
        : content != null && String(content).trim() !== ""
          ? String(content)
          : null;

    const requiresReviewBit =
      requiresReview === undefined || requiresReview === null
        ? null
        : requiresReview === true ||
          requiresReview === 1 ||
          requiresReview === "1" ||
          requiresReview === "true"
          ? 1
          : 0;

    const result = await sequelize.query(
      `EXEC USP_STUDY_PLAN_SLOT_UPSERT
        @PLANID=:planId,
        @CREATORUSERID=:userId,
        @DAYID=:dayId,
        @SLOTID=:slotId,
        @SLOTTYPE=:slotType,
        @TITLE=:title,
        @DESCRIPTION=:description,
        @ESTIMATEDMINUTES=:estimatedMinutes,
        @SORTORDER=:sortOrder,
        @TOPICID=:topicId,
        @CONTENTID=:contentId,
        @CONTENTFILEUUID=:contentFileUuid,
        @EXTERNALURL=:externalUrl,
        @QUIZJSON=:quizJson,
        @REQUIRESREVIEW=:requiresReview,
        @REVIEWMETHOD=:reviewMethod,
        @REVIEWDIFFICULTY=:reviewDifficulty,
        @ESTIMATEDRECALLMINUTES=:estimatedRecallMinutes,
        @REVIEWTEMPLATE=:reviewTemplate,
        @REVIEWCONFIGJSON=:reviewConfigJson`,
      {
        replacements: {
          planId: parseInt(planId, 10),
          userId: req.userId,
          dayId: Number.isFinite(dayIdNum) ? dayIdNum : null,
          slotId: slotId ? parseInt(slotId, 10) : null,
          slotType: normaliseSlotType(slotType),
          title:
            title != null && String(title).trim() !== ""
              ? String(title).trim()
              : null,
          description: descriptionValue,
          estimatedMinutes: toIntOrNull(estimatedMinutes),
          sortOrder: toIntOrNull(sortOrder),
          topicId: toIntOrNull(topicId),
          contentId: toIntOrNull(contentId),
          contentFileUuid:
            contentFileUuid != null && String(contentFileUuid).trim() !== ""
              ? String(contentFileUuid).trim()
              : null,
          externalUrl:
            externalUrl != null && String(externalUrl).trim() !== ""
              ? String(externalUrl).trim()
              : null,
          quizJson: quizJsonStr,
          requiresReview: requiresReviewBit,
          reviewMethod:
            reviewMethod != null && String(reviewMethod).trim() !== ""
              ? String(reviewMethod).trim().toUpperCase()
              : null,
          reviewDifficulty:
            reviewDifficulty != null && String(reviewDifficulty).trim() !== ""
              ? String(reviewDifficulty).trim().toUpperCase()
              : null,
          estimatedRecallMinutes: toIntOrNull(estimatedRecallMinutes),
          reviewTemplate:
            reviewTemplate != null && String(reviewTemplate).trim() !== ""
              ? String(reviewTemplate).trim().toUpperCase()
              : null,
          reviewConfigJson: reviewConfigStr,
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res.status(400).json({
        success: false,
        message: row?.MESSAGE || "Upsert slot failed",
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        slotId: Number(row.SLOTID),
        sortOrder: row.SORTORDER != null ? Number(row.SORTORDER) : undefined,
      },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("upsertSlot error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const deleteSlot = async (req, res) => {
  try {
    const { planId, slotId } = req.params;

    const result = await sequelize.query(
      `EXEC USP_STUDY_PLAN_SLOT_DELETE
        @PLANID=:planId,
        @CREATORUSERID=:userId,
        @SLOTID=:slotId`,
      {
        replacements: {
          planId: parseInt(planId, 10),
          userId: req.userId,
          slotId: parseInt(slotId, 10),
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res.status(400).json({
        success: false,
        message: row?.MESSAGE || "Delete slot failed",
      });
    }
    return res.status(200).json({
      success: true,
      data: { slotId: Number(slotId) },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("deleteSlot error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const reorderSlots = async (req, res) => {
  try {
    const { planId } = req.params;
    const { dayId, orders } = req.body;

    const dayIdNum = dayId != null ? parseInt(dayId, 10) : NaN;
    if (!Number.isFinite(dayIdNum)) {
      return res
        .status(400)
        .json({ success: false, message: "dayId is required" });
    }

    if (!Array.isArray(orders) || orders.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "orders array is required" });
    }

    const slotOrders = orders.map((o) => ({
      slotId: Number(o.slotId != null ? o.slotId : o.SLOTID),
      sortOrder: Number(o.sortOrder != null ? o.sortOrder : o.SORTORDER),
    }));

    const result = await sequelize.query(
      `EXEC USP_STUDY_PLAN_SLOT_REORDER
        @DAYID=:dayId,
        @PLANID=:planId,
        @CREATORUSERID=:userId,
        @SLOTORDERSJSON=:slotOrdersJson`,
      {
        replacements: {
          dayId: dayIdNum,
          planId: parseInt(planId, 10),
          userId: req.userId,
          slotOrdersJson: JSON.stringify(slotOrders),
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res
        .status(400)
        .json({ success: false, message: row?.MESSAGE || "Reorder failed" });
    }
    return res.status(200).json({
      success: true,
      data: { updatedCount: Number(row.UPDATEDCOUNT ?? slotOrders.length) },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("reorderSlots error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  upsertDay,
  deleteDay,
  upsertSlot,
  deleteSlot,
  reorderSlots,
};
