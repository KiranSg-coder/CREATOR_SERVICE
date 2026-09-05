const { QueryTypes } = require("sequelize");
const sequelize = require("../config/database");
const {
  planFromRow,
  tagFromRow,
  nestDaysWithSlots,
} = require("../lib/normalize");

/** Map API body to USP_STUDY_PLAN_* column names (SHORTDESCRIPTION, FULLDESCRIPTION, DIFFICULTY, DURATIONDAYS, …). */
function planMetadataFromBody(body) {
  const shortDescription =
    body.shortDescription != null && String(body.shortDescription).trim() !== ""
      ? String(body.shortDescription).trim()
      : body.description != null && String(body.description).trim() !== ""
        ? String(body.description).trim()
        : null;

  const fullDescription =
    body.fullDescription != null && String(body.fullDescription).trim() !== ""
      ? String(body.fullDescription).trim()
      : null;

  const difficultyRaw =
    body.difficulty != null
      ? body.difficulty
      : body.difficultyLevel != null
        ? body.difficultyLevel
        : null;
  const difficulty =
    difficultyRaw != null && String(difficultyRaw).trim() !== ""
      ? String(difficultyRaw).trim().toUpperCase()
      : null;

  const durationRaw =
    body.durationDays != null
      ? body.durationDays
      : body.estimatedDays != null
        ? body.estimatedDays
        : null;
  const durationParsed =
    durationRaw != null && durationRaw !== ""
      ? parseInt(durationRaw, 10)
      : NaN;
  const durationDays =
    Number.isFinite(durationParsed) ? durationParsed : null;

  return {
    title:
      body.title != null && String(body.title).trim() !== ""
        ? String(body.title).trim()
        : null,
    shortDescription,
    fullDescription,
    category:
      body.category != null && String(body.category).trim() !== ""
        ? String(body.category).trim().toUpperCase()
        : null,
    difficulty,
    durationDays,
    themeColorHex:
      body.themeColorHex != null && String(body.themeColorHex).trim() !== ""
        ? String(body.themeColorHex).trim()
        : null,
    coverFileUuid:
      body.coverFileUuid != null && String(body.coverFileUuid).trim() !== ""
        ? String(body.coverFileUuid).trim()
        : null,
    bannerFileUuid:
      body.bannerFileUuid != null && String(body.bannerFileUuid).trim() !== ""
        ? String(body.bannerFileUuid).trim()
        : null,
    planIconEmoji:
      body.planIconEmoji != null && String(body.planIconEmoji).trim() !== ""
        ? String(body.planIconEmoji).trim()
        : null,
    progressionMode: (() => {
      const raw =
        body.progressionMode != null
          ? String(body.progressionMode).trim().toUpperCase()
          : body.PROGRESSIONMODE != null
            ? String(body.PROGRESSIONMODE).trim().toUpperCase()
            : null;
      if (
        raw &&
        ["SELF_PACED", "DAILY_GUIDED", "WEEKLY", "SCHEDULED", "COHORT"].includes(raw)
      ) {
        return raw;
      }
      return null;
    })(),
    unlockTimeLocal:
      body.unlockTimeLocal != null && String(body.unlockTimeLocal).trim() !== ""
        ? String(body.unlockTimeLocal).trim()
        : null,
    scheduleJson:
      body.scheduleJson != null
        ? typeof body.scheduleJson === "string"
          ? body.scheduleJson
          : JSON.stringify(body.scheduleJson)
        : null,
  };
}

const createPlan = async (req, res) => {
  try {
    const meta = planMetadataFromBody(req.body);
    if (!meta.title) {
      return res
        .status(400)
        .json({ success: false, message: "title is required" });
    }

    const durationDays = meta.durationDays != null ? meta.durationDays : 1;

    const result = await sequelize.query(
      `EXEC USP_STUDY_PLAN_CREATE
        @CREATORUSERID=:userId,
        @TITLE=:title,
        @SHORTDESCRIPTION=:shortDescription,
        @FULLDESCRIPTION=:fullDescription,
        @DURATIONDAYS=:durationDays,
        @CATEGORY=:category,
        @DIFFICULTY=:difficulty,
        @THEMECOLORHEX=:themeColorHex,
        @COVERFILEUUID=:coverFileUuid,
        @BANNERFILEUUID=:bannerFileUuid,
        @PLANICONEMOJI=:planIconEmoji,
        @PROGRESSIONMODE=:progressionMode,
        @UNLOCKTIMELOCAL=:unlockTimeLocal,
        @SCHEDULEJSON=:scheduleJson`,
      {
        replacements: {
          userId: req.userId,
          title: meta.title,
          shortDescription: meta.shortDescription,
          fullDescription: meta.fullDescription,
          durationDays,
          category: meta.category,
          difficulty: meta.difficulty,
          themeColorHex: meta.themeColorHex,
          coverFileUuid: meta.coverFileUuid,
          bannerFileUuid: meta.bannerFileUuid,
          planIconEmoji: meta.planIconEmoji,
          progressionMode: meta.progressionMode || "DAILY_GUIDED",
          unlockTimeLocal: meta.unlockTimeLocal,
          scheduleJson: meta.scheduleJson,
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res
        .status(400)
        .json({ success: false, message: row?.MESSAGE || "Create failed" });
    }
    return res.status(201).json({
      success: true,
      data: { planId: Number(row.PLANID) },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("createPlan error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const listMyPlans = async (req, res) => {
  try {
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const page = parseInt(req.query.page, 10) || 1;
    const status =
      req.query.status != null && String(req.query.status).trim() !== ""
        ? String(req.query.status).trim().toUpperCase()
        : null;

    const result = await sequelize.query(
      `EXEC USP_STUDY_PLAN_LIST_BY_CREATOR @CREATORUSERID=:userId`,
      {
        replacements: { userId: req.userId },
        type: QueryTypes.SELECT,
      }
    );

    let rows = result || [];
    if (status) rows = rows.filter((r) => r.PLANSTATUS === status);

    const all = (result || []).map(planFromRow);
    const stats = {
      totalPlans: all.length,
      draftCount: all.filter((p) => p.status === "DRAFT").length,
      publishedCount: all.filter((p) => p.status === "PUBLISHED").length,
      unlistedCount: all.filter((p) => p.status === "UNLISTED").length,
      archivedCount: all.filter((p) => p.status === "ARCHIVED").length,
      totalEnrollments: all.reduce(
        (sum, p) => sum + (Number(p.enrollmentCount) || 0),
        0
      ),
      avgRating: (() => {
        const rated = all.filter((p) => p.avgRating != null);
        if (!rated.length) return null;
        return rated.reduce((s, p) => s + p.avgRating, 0) / rated.length;
      })(),
    };

    const total = rows.length;
    const start = (page - 1) * pageSize;
    const paged = rows.slice(start, start + pageSize).map(planFromRow);

    return res.status(200).json({
      success: true,
      data: paged,
      plans: paged,
      stats,
      page,
      pageSize,
      total,
    });
  } catch (error) {
    console.error("listMyPlans error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const getPlanDetail = async (req, res) => {
  try {
    const { planId } = req.params;
    const pid = parseInt(planId, 10);
    if (!Number.isFinite(pid)) {
      return res
        .status(400)
        .json({ success: false, message: "planId must be a number" });
    }
    const replacements = { planId: pid, userId: req.userId };

    const planResult = await sequelize.query(
      `EXEC USP_STUDY_PLAN_GET_DETAIL @PLANID=:planId, @CREATORUSERID=:userId`,
      { replacements, type: QueryTypes.SELECT }
    );

    const planRow = planResult[0] || null;
    if (!planRow || planRow.SUCCESS === 0) {
      return res.status(404).json({
        success: false,
        message: planRow?.MESSAGE || "Plan not found",
      });
    }

    const plan = planFromRow(planRow);
    const version = plan.currentVersionNo || 1;

    const [dayRows, slotRows, tagRows] = await Promise.all([
      sequelize.query(
        `SELECT * FROM STUDY_PLAN_DAY
         WHERE PLANID=:planId AND PLANVERSION=:version
         ORDER BY DAYNUMBER`,
        {
          replacements: { planId: pid, version },
          type: QueryTypes.SELECT,
        }
      ),
      sequelize.query(
        `SELECT S.* FROM STUDY_PLAN_SLOT S
         INNER JOIN STUDY_PLAN_DAY D ON S.DAYID = D.DAYID
         WHERE D.PLANID=:planId AND S.PLANVERSION=:version
         ORDER BY D.DAYNUMBER, S.SORTORDER`,
        {
          replacements: { planId: pid, version },
          type: QueryTypes.SELECT,
        }
      ),
      sequelize.query(
        `SELECT TAG FROM STUDY_PLAN_TAG WHERE PLANID=:planId ORDER BY TAG`,
        {
          replacements: { planId: pid },
          type: QueryTypes.SELECT,
        }
      ),
    ]);

    const days = nestDaysWithSlots(dayRows, slotRows);
    const tags = (tagRows || []).map(tagFromRow).filter(Boolean);

    // Return both flat and nested shapes so frontend can use either
    const merged = { ...plan, days, tags };

    return res.status(200).json({
      success: true,
      data: merged,
    });
  } catch (error) {
    console.error("getPlanDetail error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const updateMetadata = async (req, res) => {
  try {
    const { planId } = req.params;
    const meta = planMetadataFromBody(req.body);

    const result = await sequelize.query(
      `EXEC USP_STUDY_PLAN_UPDATE_METADATA
        @PLANID=:planId,
        @CREATORUSERID=:userId,
        @TITLE=:title,
        @SHORTDESCRIPTION=:shortDescription,
        @FULLDESCRIPTION=:fullDescription,
        @DURATIONDAYS=:durationDays,
        @CATEGORY=:category,
        @DIFFICULTY=:difficulty,
        @THEMECOLORHEX=:themeColorHex,
        @COVERFILEUUID=:coverFileUuid,
        @BANNERFILEUUID=:bannerFileUuid,
        @PLANICONEMOJI=:planIconEmoji,
        @PROGRESSIONMODE=:progressionMode,
        @UNLOCKTIMELOCAL=:unlockTimeLocal,
        @SCHEDULEJSON=:scheduleJson`,
      {
        replacements: {
          planId: parseInt(planId, 10),
          userId: req.userId,
          title: meta.title,
          shortDescription: meta.shortDescription,
          fullDescription: meta.fullDescription,
          durationDays: meta.durationDays,
          category: meta.category,
          difficulty: meta.difficulty,
          themeColorHex: meta.themeColorHex,
          coverFileUuid: meta.coverFileUuid,
          bannerFileUuid: meta.bannerFileUuid,
          planIconEmoji: meta.planIconEmoji,
          progressionMode: meta.progressionMode,
          unlockTimeLocal: meta.unlockTimeLocal,
          scheduleJson: meta.scheduleJson,
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res
        .status(400)
        .json({ success: false, message: row?.MESSAGE || "Update failed" });
    }
    return res.status(200).json({
      success: true,
      data: { planId: Number(planId) },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("updateMetadata error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const publishPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const replacements = {
      planId: parseInt(planId, 10),
      userId: req.userId,
    };

    const validation = await sequelize.query(
      `EXEC USP_STUDY_PLAN_PUBLISH_VALIDATE @PLANID=:planId, @CREATORUSERID=:userId`,
      { replacements, type: QueryTypes.SELECT }
    );

    const vRow = validation[0];
    if (!vRow || vRow.SUCCESS === 0) {
      return res.status(400).json({
        success: false,
        message: vRow?.MESSAGE || "Validation failed",
        errors: vRow?.ERRORS || null,
      });
    }

    const commit = await sequelize.query(
      `EXEC USP_STUDY_PLAN_PUBLISH_COMMIT @PLANID=:planId, @CREATORUSERID=:userId`,
      { replacements, type: QueryTypes.SELECT }
    );

    const cRow = commit[0];
    if (!cRow || cRow.SUCCESS === 0) {
      return res.status(400).json({
        success: false,
        message: cRow?.MESSAGE || "Publish commit failed",
      });
    }

    const publishedPlanId = Number(cRow.PLANID ?? planId);
    const versionNo = Number(cRow.VERSIONNO ?? 1);

    // Ensure catalog rollup row exists so list/dashboard enroll counts are non-null.
    try {
      await sequelize.query(
        `EXEC USP_CATALOG_ROLLUP_UPSERT
          @PLANID=:planId,
          @PLANVERSION=:planVersion,
          @AVGRATING=:avgRating,
          @REVIEWCOUNT=:reviewCount,
          @ENROLLCOUNT=:enrollCount,
          @COMPLETIONPERCENT=:completionPercent`,
        {
          replacements: {
            planId: publishedPlanId,
            planVersion: versionNo,
            avgRating: null,
            reviewCount: 0,
            enrollCount: 0,
            completionPercent: 0,
          },
          type: QueryTypes.SELECT,
        }
      );
    } catch (rollupErr) {
      console.warn("publishPlan → rollup init:", rollupErr.message);
    }

    return res.status(200).json({
      success: true,
      data: {
        planId: publishedPlanId,
        versionNo,
      },
      message: cRow.MESSAGE,
    });
  } catch (error) {
    console.error("publishPlan error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const archivePlan = async (req, res) => {
  try {
    const { planId } = req.params;

    const result = await sequelize.query(
      `EXEC USP_STUDY_PLAN_ARCHIVE @PLANID=:planId, @CREATORUSERID=:userId`,
      {
        replacements: { planId: parseInt(planId, 10), userId: req.userId },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res
        .status(400)
        .json({ success: false, message: row?.MESSAGE || "Archive failed" });
    }
    return res.status(200).json({
      success: true,
      data: { planId: Number(planId), status: "ARCHIVED" },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("archivePlan error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const unlistPlan = async (req, res) => {
  try {
    const { planId } = req.params;

    const result = await sequelize.query(
      `EXEC USP_STUDY_PLAN_UNLIST @PLANID=:planId, @CREATORUSERID=:userId`,
      {
        replacements: { planId: parseInt(planId, 10), userId: req.userId },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res
        .status(400)
        .json({ success: false, message: row?.MESSAGE || "Unlist failed" });
    }
    return res.status(200).json({
      success: true,
      data: { planId: Number(planId), status: "UNLISTED" },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("unlistPlan error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const replaceTags = async (req, res) => {
  try {
    const { planId } = req.params;
    const { tags } = req.body;

    const cleaned = Array.isArray(tags)
      ? tags
          .map((t) => (typeof t === "string" ? t.trim() : ""))
          .filter((t) => t.length > 0)
      : [];

    const result = await sequelize.query(
      `EXEC USP_STUDY_PLAN_TAGS_REPLACE @PLANID=:planId, @CREATORUSERID=:userId, @TAGSJSON=:tagsJson`,
      {
        replacements: {
          planId: parseInt(planId, 10),
          userId: req.userId,
          tagsJson: JSON.stringify(cleaned),
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res.status(400).json({
        success: false,
        message: row?.MESSAGE || "Replace tags failed",
      });
    }
    return res.status(200).json({
      success: true,
      data: { tags: cleaned, tagCount: Number(row.TAGCOUNT ?? cleaned.length) },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("replaceTags error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const deletePlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const pid = parseInt(planId, 10);

    const result = await sequelize.query(
      `EXEC USP_STUDY_PLAN_DELETE @PLANID=:planId, @CREATORUSERID=:userId`,
      {
        replacements: { planId: pid, userId: req.userId },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res
        .status(400)
        .json({ success: false, message: row?.MESSAGE || "Delete failed" });
    }
    return res.status(200).json({
      success: true,
      data: { planId: pid, mode: row.MODE ?? null },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("deletePlan error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

/**
 * Create a new DRAFT version by copying days/slots from the current published version.
 * Required before editing a plan that is already PUBLISHED / UNLISTED.
 */
const createNewVersion = async (req, res) => {
  try {
    const planId = parseInt(req.params.planId, 10);
    const changeNotes =
      req.body?.changeNotes != null && String(req.body.changeNotes).trim() !== ""
        ? String(req.body.changeNotes).trim()
        : req.body?.notes != null && String(req.body.notes).trim() !== ""
          ? String(req.body.notes).trim()
          : null;

    const result = await sequelize.query(
      `EXEC USP_STUDY_PLAN_VERSION_COPY
        @PLANID=:planId,
        @CREATORUSERID=:userId,
        @CHANGENOTES=:changeNotes`,
      {
        replacements: {
          planId,
          userId: req.userId,
          changeNotes,
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res.status(400).json({
        success: false,
        message: row?.MESSAGE || "Could not create new version",
      });
    }
    return res.status(201).json({
      success: true,
      data: {
        planId,
        versionNo: Number(row.VERSIONNO),
        status: "DRAFT",
      },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("createNewVersion error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  createPlan,
  listMyPlans,
  getPlanDetail,
  updateMetadata,
  publishPlan,
  archivePlan,
  unlistPlan,
  replaceTags,
  deletePlan,
  createNewVersion,
};
