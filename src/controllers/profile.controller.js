const { QueryTypes } = require("sequelize");
const sequelize = require("../config/database");
const { creatorProfileFromRow } = require("../lib/normalize");

/** Accept file UUID from FILE_DOCUMENT_SERVICE (or plain UUID string sent as legacy "url"). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeExpertiseTags(tags) {
  if (tags == null || tags === "") return null;
  if (Array.isArray(tags)) return tags.map(String).join(", ");
  return String(tags);
}

function pickFileUuid(primary, legacy) {
  if (primary != null && String(primary).trim() !== "")
    return String(primary).trim();
  if (legacy != null && String(legacy).trim() !== "") {
    const s = String(legacy).trim();
    if (UUID_RE.test(s)) return s;
  }
  return null;
}

const getOwnProfile = async (req, res) => {
  try {
    const result = await sequelize.query(
      `EXEC USP_CREATOR_PROFILE_GET_SELF @USERID=:userId`,
      {
        replacements: { userId: req.userId },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0] || null;
    return res
      .status(200)
      .json({ success: true, data: creatorProfileFromRow(row) });
  } catch (error) {
    console.error("getOwnProfile error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

/**
 * Body fields (match SP USP_CREATOR_PROFILE_UPSERT):
 * displayName, bio, expertiseTags (string | string[]), publicEmail,
 * avatarFileUuid, coverFileUuid, websiteUrl
 * Aliases: website → websiteUrl; avatarUrl/coverImageUrl if value is a UUID string;
 * specializations → expertiseTags (array or string)
 */
const upsertProfile = async (req, res) => {
  try {
    const {
      displayName,
      bio,
      expertiseTags,
      publicEmail,
      avatarFileUuid,
      coverFileUuid,
      websiteUrl,
      website,
      avatarUrl,
      coverImageUrl,
      specializations,
    } = req.body;

    const expertiseFromSpec =
      specializations != null
        ? Array.isArray(specializations)
          ? specializations.join(", ")
          : String(specializations)
        : null;

    const expertiseTagsStr =
      normalizeExpertiseTags(expertiseTags) ?? expertiseFromSpec;

    const avatarUuid = pickFileUuid(avatarFileUuid, avatarUrl);
    const coverUuid = pickFileUuid(coverFileUuid, coverImageUrl);
    const site =
      websiteUrl != null && String(websiteUrl).trim() !== ""
        ? String(websiteUrl).trim()
        : website != null && String(website).trim() !== ""
          ? String(website).trim()
          : null;

    const name =
      displayName != null && String(displayName).trim() !== ""
        ? String(displayName).trim()
        : null;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "displayName is required",
      });
    }

    const result = await sequelize.query(
      `EXEC USP_CREATOR_PROFILE_UPSERT
        @USERID=:userId,
        @DISPLAYNAME=:displayName,
        @BIO=:bio,
        @EXPERTISETAGS=:expertiseTagsStr,
        @PUBLICEMAIL=:publicEmail,
        @AVATARFILEUUID=:avatarFileUuid,
        @COVERFILEUUID=:coverFileUuid,
        @WEBSITEURL=:websiteUrl`,
      {
        replacements: {
          userId: req.userId,
          displayName: name,
          bio: bio != null ? String(bio) : null,
          expertiseTagsStr,
          publicEmail:
            publicEmail != null && String(publicEmail).trim() !== ""
              ? String(publicEmail).trim()
              : null,
          avatarFileUuid: avatarUuid,
          coverFileUuid: coverUuid,
          websiteUrl: site,
        },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0];
    if (!row || row.SUCCESS === 0) {
      return res
        .status(400)
        .json({ success: false, message: row?.MESSAGE || "Upsert failed" });
    }

    // Re-fetch to return the canonical, normalised profile.
    const reload = await sequelize.query(
      `EXEC USP_CREATOR_PROFILE_GET_SELF @USERID=:userId`,
      { replacements: { userId: req.userId }, type: QueryTypes.SELECT }
    );
    return res.status(200).json({
      success: true,
      data: creatorProfileFromRow(reload[0] || null),
      message: row.MESSAGE,
    });
  } catch (error) {
    console.error("upsertProfile error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const getPublicProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await sequelize.query(
      `EXEC USP_CREATOR_PROFILE_GET_PUBLIC @USERID=:userId`,
      {
        replacements: { userId: parseInt(userId, 10) },
        type: QueryTypes.SELECT,
      }
    );

    const row = result[0] || null;
    if (!row) {
      return res
        .status(404)
        .json({ success: false, message: "Creator profile not found" });
    }
    return res
      .status(200)
      .json({ success: true, data: creatorProfileFromRow(row) });
  } catch (error) {
    console.error("getPublicProfile error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  getOwnProfile,
  upsertProfile,
  getPublicProfile,
};
