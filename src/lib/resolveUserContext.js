"use strict";
const jwt = require("jsonwebtoken");

/**
 * Identity resolution for a request reaching this service (production review S4).
 *
 * 1. The signed bearer token is the ONLY source of a user's identity.
 * 2. Identity headers (x-user-id and the tenant headers) are trusted ONLY on genuine
 *    service-to-service calls that carry a valid x-service-key. A client — or anything that
 *    can reach this service's port directly — can no longer act as another user by sending
 *    `x-user-id`.
 * 3. A malformed header never overrides or contradicts a valid token.
 *
 * Requires JWT_SECRET (same value as the API gateway) and INTERNAL_SERVICE_KEY for
 * service-to-service calls. Without JWT_SECRET every user request is rejected (fail closed).
 */

let warnedMissingSecret = false;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (!warnedMissingSecret) {
      console.error(
        "[auth] JWT_SECRET is not set — user requests to this service will be rejected (401).",
      );
      warnedMissingSecret = true;
    }
    return null;
  }
  return secret;
}

/** True only when the caller presents the shared internal service key (current or, during rotation, previous). */
const { hasValidServiceKey } = require("./serviceKey");

function decodeBearer(req) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth || !String(auth).startsWith("Bearer ")) return null;

  const secret = getJwtSecret();
  if (!secret) return null;

  try {
    return jwt.verify(String(auth).slice(7).trim(), secret);
  } catch {
    return null;
  }
}

/** Parse a header/claim into a positive integer id, or null. */
function toUserId(value) {
  if (value == null || value === "") return null;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveUserId(req) {
  // 1. Verified token — cryptographically trustworthy.
  const decoded = decodeBearer(req);
  if (decoded) {
    const fromToken = toUserId(decoded.userId ?? decoded.userid ?? decoded.sub);
    if (fromToken) return fromToken;
  }

  // 2. Identity header — only from an authenticated internal service.
  if (hasValidServiceKey(req)) {
    return toUserId(req.headers["x-user-id"]);
  }
  return null;
}

function resolveTenantHeaders(req) {
  const decoded = decodeBearer(req);
  const fromToken = decoded
    ? {
        entityCode: decoded.entityCode ?? null,
        companyCode: decoded.companyCode ?? null,
        branchCode: decoded.branchCode ?? null,
        appCode: decoded.appCode ?? null,
      }
    : {};

  // Headers may only fill gaps for authenticated internal calls.
  const trustHeaders = hasValidServiceKey(req);
  const header = (name) => (trustHeaders ? req.headers[name] || null : null);

  return {
    entityCode: fromToken.entityCode || header("x-entity-code"),
    companyCode: fromToken.companyCode || header("x-company-code"),
    branchCode: fromToken.branchCode || header("x-branch-code"),
    appCode: fromToken.appCode || header("x-app-code"),
  };
}

module.exports = { resolveUserId, resolveTenantHeaders, decodeBearer, hasValidServiceKey };
