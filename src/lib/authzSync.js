const axios = require("axios");

/**
 * Ensure DEFAULT_USER + PREMIUM_USER + CREATOR_USER after application approval.
 * Additive stacking — never removes roles. Requires INTERNAL_SERVICE_KEY.
 */

function authzBaseUrl() {
  return (process.env.AUTHORIZATION_SERVICE_URL || "http://localhost:6001").replace(
    /\/$/,
    "",
  );
}

function serviceHeaders() {
  const serviceKey = process.env.INTERNAL_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error(
      "INTERNAL_SERVICE_KEY is not set on Creator Service (required to sync CREATOR_USER to AuthZ)",
    );
  }
  return {
    "Content-Type": "application/json",
    "X-Service-Key": serviceKey,
  };
}

function normalizeTenantCode(value, fallback) {
  if (value == null) return fallback;
  const s = String(value).trim();
  if (!s || s === "1") return fallback;
  return s;
}

function defaultTenant() {
  return {
    entityCode: process.env.DEFAULT_ENTITY_CODE || "STREAK01",
    companyCode: process.env.DEFAULT_COMPANY_CODE || "STREAK01",
    branchCode: process.env.DEFAULT_BRANCH_CODE || "STREAK01",
    appCode: process.env.APP_CODE || "POS01",
  };
}

function tenantFromReq(req) {
  const h = req?.headers || {};
  const d = defaultTenant();
  return {
    entityCode: normalizeTenantCode(
      req?.entityCode || h["x-entity-code"],
      d.entityCode,
    ),
    companyCode: normalizeTenantCode(
      req?.companyCode || h["x-company-code"],
      d.companyCode,
    ),
    branchCode: normalizeTenantCode(
      req?.branchCode || h["x-branch-code"],
      d.branchCode,
    ),
    appCode: normalizeTenantCode(
      req?.appCode || h["x-app-code"],
      d.appCode,
    ),
  };
}

async function withRetry(fn, { attempts = 3, delayMs = 350 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}

/**
 * Prefer the applicant's existing USERROLE tenant over the admin JWT tenant.
 */
async function resolveApplicantTenant(userId, fallbackTenant) {
  const fallback = { ...defaultTenant(), ...fallbackTenant };
  try {
    const { data } = await axios.get(
      `${authzBaseUrl()}/internal/user/${Number(userId)}/tenant`,
      { headers: serviceHeaders(), timeout: 8000, validateStatus: () => true },
    );
    if (data?.success && data?.data) {
      const d = data.data;
      return {
        entityCode: normalizeTenantCode(d.entityCode, fallback.entityCode),
        companyCode: normalizeTenantCode(d.companyCode, fallback.companyCode),
        branchCode: normalizeTenantCode(d.branchCode, fallback.branchCode),
        appCode: normalizeTenantCode(d.appCode, fallback.appCode),
      };
    }
  } catch (err) {
    console.warn(
      `[Creator→AuthZ] resolve tenant failed userId=${userId}:`,
      err.message,
    );
  }
  return fallback;
}

async function ensureUserRole({
  userId,
  entityCode,
  companyCode,
  branchCode,
  appCode,
  roleCode,
  createdBy = "CREATOR_SERVICE",
}) {
  const { data } = await axios.post(
    `${authzBaseUrl()}/internal/user/ensure-role`,
    {
      userId: Number(userId),
      entityCode,
      companyCode,
      branchCode,
      appCode,
      roleCode,
      createdBy,
    },
    { headers: serviceHeaders(), timeout: 10000, validateStatus: () => true },
  );
  if (!data || data.success === false) {
    throw new Error(data?.message || `AuthZ ensure-role ${roleCode} failed`);
  }
  return data;
}

/**
 * Stack DEFAULT_USER + PREMIUM_USER + CREATOR_USER (additive).
 * CREATOR_USER is required for ok=true; others are best-effort with retry.
 */
async function syncCreatorRolesOnApprove({ userId, ...hintTenant }) {
  const defaultCode = process.env.DEFAULT_USER_ROLE_CODE || "DEFAULT_USER";
  const creatorCode = process.env.CREATOR_USER_ROLE_CODE || "CREATOR_USER";
  const premiumCode = process.env.PREMIUM_USER_ROLE_CODE || "PREMIUM_USER";

  const tenant = await resolveApplicantTenant(userId, hintTenant);
  const results = [];
  const base = {
    userId: Number(userId),
    ...tenant,
    createdBy: "CREATOR_APP_APPROVE",
  };

  console.info(
    `[Creator→AuthZ] sync stack userId=${userId} tenant=${tenant.entityCode}/${tenant.companyCode}/${tenant.branchCode}/${tenant.appCode}`,
  );

  // Keep Default User present (signup may have failed sync earlier).
  try {
    const def = await withRetry(() =>
      ensureUserRole({ ...base, roleCode: defaultCode }),
    );
    results.push({ roleCode: defaultCode, ok: true, data: def });
  } catch (err) {
    console.warn(
      `[Creator→AuthZ] ensure ${defaultCode} failed userId=${userId}:`,
      err.message,
    );
    results.push({ roleCode: defaultCode, ok: false, error: err.message });
  }

  try {
    const premium = await withRetry(() =>
      ensureUserRole({ ...base, roleCode: premiumCode }),
    );
    results.push({ roleCode: premiumCode, ok: true, data: premium });
  } catch (err) {
    console.warn(
      `[Creator→AuthZ] ensure ${premiumCode} failed userId=${userId}:`,
      err.message,
    );
    results.push({ roleCode: premiumCode, ok: false, error: err.message });
  }

  try {
    const creator = await withRetry(() =>
      ensureUserRole({ ...base, roleCode: creatorCode }),
    );
    results.push({ roleCode: creatorCode, ok: true, data: creator });
  } catch (err) {
    console.error(
      `[Creator→AuthZ] ensure ${creatorCode} failed userId=${userId}:`,
      err.message,
    );
    return {
      ok: false,
      error: err.message,
      tenant,
      results,
    };
  }

  return { ok: true, tenant, results };
}

module.exports = {
  tenantFromReq,
  ensureUserRole,
  resolveApplicantTenant,
  syncCreatorRolesOnApprove,
};
