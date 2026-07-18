const { QueryTypes } = require("sequelize");
const sequelize = require("../config/database");
const {
  planFromRow,
  tagFromRow,
  nestDaysWithSlots,
} = require("../lib/normalize");

const searchCatalog = async (req, res) => {
  try {
    const {
      q,
      category,
      difficulty,
      difficultyLevel,
      tags,
      tag,
      sortBy,
      sort,
      pageSize: ps,
      page: pg,
    } = req.query;

    const pageSize = parseInt(ps, 10) || 20;
    const page = parseInt(pg, 10) || 1;

    const difficultyParam =
      difficulty != null && String(difficulty).trim() !== ""
        ? String(difficulty).trim().toUpperCase()
        : difficultyLevel != null && String(difficultyLevel).trim() !== ""
          ? String(difficultyLevel).trim().toUpperCase()
          : null;

    let tagsCsv = null;
    if (tags != null && String(tags).trim() !== "")
      tagsCsv = String(tags).trim();
    else if (tag != null && String(tag).trim() !== "")
      tagsCsv = String(tag).trim();

    const sortRaw = sortBy || sort || "RECENT";
    const sortKey = String(sortRaw).trim().toUpperCase();
    // Accept UI aliases (NEWEST / TOP_RATED) as well as SP values.
    const sortByParam =
      sortKey === "NEWEST"
        ? "RECENT"
        : sortKey === "TOP_RATED"
          ? "RATING"
          : ["RECENT", "RATING", "POPULAR"].includes(sortKey)
            ? sortKey
            : "RECENT";

    const result = await sequelize.query(
      `EXEC USP_CATALOG_SEARCH
        @SEARCHTERM=:searchTerm,
        @TAGS=:tagsCsv,
        @CATEGORY=:category,
        @DIFFICULTY=:difficulty,
        @SORTBY=:sortByParam,
        @PAGESIZE=:pageSize,
        @PAGENUMBER=:pageNumber`,
      {
        replacements: {
          searchTerm:
            q != null && String(q).trim() !== "" ? String(q).trim() : null,
          tagsCsv,
          category:
            category != null && String(category).trim() !== ""
              ? String(category).trim().toUpperCase()
              : null,
          difficulty: difficultyParam,
          sortByParam,
          pageSize,
          pageNumber: page,
        },
        type: QueryTypes.SELECT,
      }
    );

    const rows = result || [];
    const total = rows.length > 0 ? rows[0].TOTALCOUNT ?? rows.length : 0;
    const items = rows.map((r) => {
      const { TOTALCOUNT: _t, ...rest } = r;
      return planFromRow(rest);
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
    console.error("searchCatalog error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const getCatalogPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const pid = parseInt(planId, 10);
    if (!Number.isFinite(pid)) {
      return res
        .status(400)
        .json({ success: false, message: "planId must be a number" });
    }

    const planResult = await sequelize.query(
      `EXEC USP_CATALOG_GET_PLAN_PUBLIC @PLANID=:planId`,
      {
        replacements: { planId: pid },
        type: QueryTypes.SELECT,
      }
    );

    const planRow = planResult[0] || null;
    if (!planRow || planRow.SUCCESS === 0) {
      return res.status(404).json({
        success: false,
        message: planRow?.MESSAGE || "Plan not found in catalog",
      });
    }

    const plan = planFromRow(planRow);
    const version = plan.currentVersionNo || 1;

    const [dayRows, slotRows, tagRows] = await Promise.all([
      sequelize.query(
        `SELECT * FROM STUDY_PLAN_DAY
         WHERE PLANID=:planId AND PLANVERSION=:version
         ORDER BY DAYNUMBER`,
        { replacements: { planId: pid, version }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT S.* FROM STUDY_PLAN_SLOT S
         INNER JOIN STUDY_PLAN_DAY D ON S.DAYID = D.DAYID
         WHERE D.PLANID=:planId AND S.PLANVERSION=:version
         ORDER BY D.DAYNUMBER, S.SORTORDER`,
        { replacements: { planId: pid, version }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT TAG FROM STUDY_PLAN_TAG WHERE PLANID=:planId ORDER BY TAG`,
        { replacements: { planId: pid }, type: QueryTypes.SELECT }
      ),
    ]);

    const days = nestDaysWithSlots(dayRows, slotRows);
    const tags = (tagRows || []).map(tagFromRow).filter(Boolean);

    const creator = {
      userId: plan.creatorUserId,
      displayName: plan.creatorDisplayName || null,
      avatarFileUuid: plan.creatorAvatar || null,
      publicEmail: plan.creatorPublicEmail || null,
      bio: plan.creatorBio || plan.bio || null,
    };

    return res.status(200).json({
      success: true,
      data: { ...plan, days, tags, creator },
    });
  } catch (error) {
    console.error("getCatalogPlan error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const suggestTags = async (_req, res) => {
  try {
    const result = await sequelize.query(
      `SELECT DISTINCT TOP 50 TAG FROM STUDY_PLAN_TAG ORDER BY TAG`,
      { type: QueryTypes.SELECT }
    );

    const tags = result.map((r) => r.TAG);
    return res.status(200).json({ success: true, data: tags });
  } catch (error) {
    console.error("suggestTags error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const submitReport = async (req, res) => {
  try {
    const { planId } = req.params;
    const { reasonCode, detail, reason, details } = req.body;

    const code =
      reasonCode != null && String(reasonCode).trim() !== ""
        ? String(reasonCode).trim()
        : reason != null && String(reason).trim() !== ""
          ? String(reason).trim()
          : null;

    const detailTxt =
      detail != null && String(detail).trim() !== ""
        ? String(detail).trim()
        : details != null && String(details).trim() !== ""
          ? String(details).trim()
          : null;

    if (!code) {
      return res
        .status(400)
        .json({ success: false, message: "reasonCode is required" });
    }

    const result = await sequelize.query(
      `EXEC USP_PLAN_REPORT_SUBMIT
        @PLANID=:planId,
        @REPORTEDBYUSERID=:userId,
        @REASONCODE=:reasonCode,
        @DETAIL=:detail`,
      {
        replacements: {
          planId: parseInt(planId, 10),
          userId: req.userId,
          reasonCode: code,
          detail: detailTxt,
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res.status(400).json({
        success: false,
        message: row?.MESSAGE || "Report submit failed",
      });
    }
    return res.status(201).json({
      success: true,
      data: { reportId: Number(row.REPORTID) },
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("submitReport error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const syncRollup = async (req, res) => {
  try {
    const {
      planId,
      planVersion,
      avgRating,
      reviewCount,
      enrollCount,
      completionPercent,
    } = req.body;

    if (!planId || !planVersion) {
      return res.status(400).json({
        success: false,
        message: "planId and planVersion are required",
      });
    }

    const result = await sequelize.query(
      `EXEC USP_CATALOG_ROLLUP_UPSERT
        @PLANID=:planId,
        @PLANVERSION=:planVersion,
        @AVGRATING=:avgRating,
        @REVIEWCOUNT=:reviewCount,
        @ENROLLCOUNT=:enrollCount,
        @COMPLETIONPERCENT=:completionPercent`,
      {
        replacements: {
          planId: parseInt(planId, 10),
          planVersion: parseInt(planVersion, 10),
          avgRating: avgRating != null ? parseFloat(avgRating) : null,
          reviewCount: reviewCount != null ? parseInt(reviewCount, 10) : null,
          enrollCount: enrollCount != null ? parseInt(enrollCount, 10) : null,
          completionPercent:
            completionPercent != null ? parseFloat(completionPercent) : null,
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res
        .status(400)
        .json({ success: false, message: row?.MESSAGE || "Rollup failed" });
    }

    return res.status(200).json({ success: true, message: row.MESSAGE });
  } catch (error) {
    console.error("syncRollup error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  searchCatalog,
  getCatalogPlan,
  suggestTags,
  submitReport,
  syncRollup,
};
