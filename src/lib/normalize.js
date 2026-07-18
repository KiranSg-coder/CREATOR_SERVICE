/**
 * Normalizers converting UPPERCASE SQL Server column names into the camelCase
 * shape the frontend expects. Keeps all field mapping in one place so
 * controllers stay small and the JSON contract stays consistent.
 */

const toNum = (v) => (v == null || v === "" ? null : Number(v));
const toStr = (v) => (v == null ? null : String(v));
const toBool = (v) => (v == null ? null : Boolean(v));

function planFromRow(r) {
  if (!r) return null;
  return {
    planId: toNum(r.PLANID),
    creatorUserId: toNum(r.CREATORUSERID),
    title: r.TITLE ?? null,
    shortDescription: r.SHORTDESCRIPTION ?? null,
    fullDescription: r.FULLDESCRIPTION ?? null,
    durationDays: toNum(r.DURATIONDAYS),
    category: r.CATEGORY ?? null,
    difficulty: r.DIFFICULTY ?? null,
    difficultyLevel: r.DIFFICULTY ?? null,
    themeColorHex: r.THEMECOLORHEX ?? null,
    coverFileUuid: r.COVERFILEUUID ?? null,
    bannerFileUuid: r.BANNERFILEUUID ?? null,
    planIconEmoji: r.PLANICONEMOJI ?? null,
    status: r.PLANSTATUS ?? null,
    planStatus: r.PLANSTATUS ?? null,
    currentVersionNo: toNum(r.CURRENTVERSIONNO),
    publishedAt: r.PUBLISHEDAT ?? null,
    createdAt: r.CREATEDDATE ?? null,
    updatedAt: r.UPDATEDDATE ?? null,
    dayCount: r.DAYCOUNT != null ? toNum(r.DAYCOUNT) : undefined,
    slotCount: r.SLOTCOUNT != null ? toNum(r.SLOTCOUNT) : undefined,
    avgRating: r.AVGRATING != null ? Number(r.AVGRATING) : null,
    reviewCount: r.REVIEWCOUNT != null ? toNum(r.REVIEWCOUNT) : null,
    enrollCount: r.ENROLLCOUNT != null ? toNum(r.ENROLLCOUNT) : null,
    enrollmentCount: r.ENROLLCOUNT != null ? toNum(r.ENROLLCOUNT) : null,
    completionPercent:
      r.COMPLETIONPERCENT != null ? Number(r.COMPLETIONPERCENT) : null,
    creatorDisplayName: r.CREATORDISPLAYNAME ?? undefined,
    creatorAvatar: r.CREATORAVATAR ?? undefined,
    creatorPublicEmail: r.CREATORPUBLICEMAIL ?? undefined,
    creatorBio: r.CREATORBIO ?? undefined,
    bio: r.CREATORBIO ?? undefined,
  };
}

function dayFromRow(r) {
  if (!r) return null;
  return {
    dayId: toNum(r.DAYID),
    planId: toNum(r.PLANID),
    planVersion: toNum(r.PLANVERSION),
    dayNumber: toNum(r.DAYNUMBER),
    title: r.TITLE ?? null,
    notes: r.NOTES ?? null,
    createdAt: r.CREATEDDATE ?? null,
    updatedAt: r.UPDATEDDATE ?? null,
    slots: [],
  };
}

function slotFromRow(r) {
  if (!r) return null;
  return {
    slotId: toNum(r.SLOTID),
    dayId: toNum(r.DAYID),
    planVersion: toNum(r.PLANVERSION),
    slotType: r.SLOTTYPE ?? null,
    title: r.TITLE ?? null,
    description: r.DESCRIPTION ?? null,
    content: r.DESCRIPTION ?? null,
    estimatedMinutes: toNum(r.ESTIMATEDMINUTES),
    sortOrder: toNum(r.SORTORDER),
    topicId: toNum(r.TOPICID),
    contentId: toNum(r.CONTENTID),
    contentFileUuid: r.CONTENTFILEUUID ?? null,
    externalUrl: r.EXTERNALURL ?? null,
    quizJson: r.QUIZJSON ?? null,
    createdAt: r.CREATEDDATE ?? null,
    updatedAt: r.UPDATEDDATE ?? null,
  };
}

function tagFromRow(r) {
  if (!r) return null;
  if (typeof r === "string") return r;
  return r.TAG ?? r.tag ?? null;
}

function creatorProfileFromRow(r) {
  if (!r) return null;
  return {
    userId: toNum(r.USERID),
    displayName: r.DISPLAYNAME ?? null,
    bio: r.BIO ?? null,
    expertiseTags: r.EXPERTISETAGS ?? null,
    publicEmail: r.PUBLICEMAIL ?? null,
    avatarFileUuid: r.AVATARFILEUUID ?? null,
    coverFileUuid: r.COVERFILEUUID ?? null,
    websiteUrl: r.WEBSITEURL ?? null,
    isVerifiedBadge: toBool(r.ISVERIFIEDBADGE),
    profileStatus: r.PROFILESTATUS ?? null,
    createdAt: r.CREATEDDATE ?? null,
    updatedAt: r.UPDATEDDATE ?? null,
  };
}

function applicationFromRow(r) {
  if (!r) return null;
  return {
    applicationId: toNum(r.APPLICATIONID),
    userId: toNum(r.USERID),
    status: r.STATUS ?? null,
    displayNamePref: r.DISPLAYNAMEPREF ?? null,
    bioDraft: r.BIODRAFT ?? null,
    motivation: r.MOTIVATION ?? null,
    sampleOutline: r.SAMPLEOUTLINE ?? null,
    portfolioLinks: r.PORTFOLIOLINKS ?? null,
    agreementAccepted: toBool(r.AGREEMENTACCEPTED),
    autoEligibilityJson: r.AUTOELIGIBILITYJSON ?? null,
    reviewedByUserId: toNum(r.REVIEWEDBYUSERID),
    reviewedAt: r.REVIEWEDAT ?? null,
    reviewNote: r.REVIEWNOTE ?? null,
    rejectionReason: r.REJECTIONREASON ?? null,
    submittedAt: r.SUBMITTEDAT ?? null,
    createdAt: r.CREATEDDATE ?? null,
    updatedAt: r.UPDATEDDATE ?? null,
    active: toBool(r.ACTIVE),
  };
}

function importJobFromRow(r) {
  if (!r) return null;
  return {
    jobId: toNum(r.JOBID),
    planId: toNum(r.PLANID),
    creatorUserId: toNum(r.CREATORUSERID),
    status: r.JOBSTATUS ?? null,
    jobStatus: r.JOBSTATUS ?? null,
    inputFileUuid: r.INPUTFILEUUID ?? null,
    totalRows: toNum(r.TOTALROWS),
    successRows: toNum(r.SUCCESSROWS),
    failRows: toNum(r.FAILROWS),
    resultJson: r.RESULTJSON ?? null,
    createdAt: r.CREATEDDATE ?? null,
    completedAt: r.COMPLETEDDATE ?? null,
  };
}

function reportFromRow(r) {
  if (!r) return null;
  return {
    reportId: toNum(r.REPORTID),
    planId: toNum(r.PLANID),
    planTitle: r.PLANTITLE ?? null,
    reportedByUserId: toNum(r.REPORTEDBYUSERID),
    reasonCode: r.REASONCODE ?? null,
    detail: r.DETAIL ?? null,
    status: r.REPORTSTATUS ?? null,
    reportStatus: r.REPORTSTATUS ?? null,
    createdAt: r.CREATEDDATE ?? null,
    resolvedAt: r.RESOLVEDDATE ?? null,
    resolvedByUserId: toNum(r.RESOLVEDBYUSERID),
  };
}

/** Combine day and slot arrays into a nested tree keyed by dayId. */
function nestDaysWithSlots(dayRows, slotRows) {
  const days = (dayRows || []).map(dayFromRow).filter(Boolean);
  const byDayId = new Map(days.map((d) => [d.dayId, d]));
  for (const raw of slotRows || []) {
    const slot = slotFromRow(raw);
    if (!slot) continue;
    const parent = byDayId.get(slot.dayId);
    if (parent) parent.slots.push(slot);
  }
  for (const d of days) {
    d.slots.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }
  return days;
}

module.exports = {
  planFromRow,
  dayFromRow,
  slotFromRow,
  tagFromRow,
  creatorProfileFromRow,
  applicationFromRow,
  importJobFromRow,
  reportFromRow,
  nestDaysWithSlots,
};
