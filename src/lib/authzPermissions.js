"use strict";
const axios = require("axios");

/**
 * Server-side permission checks (production review S6).
 *
 * Permissions are read from the Authorization service using the caller's own verified
 * bearer token. Client-supplied headers such as x-is-admin, x-permissions or x-roles are
 * NEVER trusted. Any failure denies access (fail closed).
 */
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // userId -> { codes: Set<string>, expiresAt }

function authzBaseUrl() {
  return (process.env.AUTHORIZATION_SERVICE_URL || "http://127.0.0.1:6001").replace(/\/$/, "");
}

function extractCodes(payload) {
  const list = Array.isArray(payload)
    ? payload
    : payload?.data ?? payload?.permissions ?? payload?.data?.permissions ?? [];
  const codes = new Set();
  for (const p of Array.isArray(list) ? list : []) {
    const code = typeof p === "string" ? p : p?.PERMISSION_CODE || p?.permissionCode;
    if (code) codes.add(String(code));
  }
  return codes;
}

async function fetchPermissionCodes(req) {
  const auth = req.headers.authorization;
  if (!auth || !String(auth).startsWith("Bearer ")) {
    throw new Error("A bearer token is required for permission checks");
  }
  const { data } = await axios.get(`${authzBaseUrl()}/user/user-permissions`, {
    headers: { Authorization: auth },
    timeout: 5000,
  });
  if (data && data.success === false) {
    throw new Error("Authorization service rejected the permission lookup");
  }
  return extractCodes(data);
}

/** True when the authenticated caller holds at least one of `codes`. */
async function userHasAnyPermission(req, codes) {
  const userId = req.userId;
  if (!userId) return false;
  const now = Date.now();
  let entry = cache.get(userId);
  if (!entry || entry.expiresAt < now) {
    entry = { codes: await fetchPermissionCodes(req), expiresAt: now + CACHE_TTL_MS };
    cache.set(userId, entry);
  }
  return codes.some((c) => entry.codes.has(c));
}

/** Express middleware: require one of `codes`. Internal service calls (req.isInternal) pass. */
function requireAnyPermission(codes, label = "permission") {
  return async (req, res, next) => {
    if (req.isInternal) return next();
    if (!req.userId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    try {
      if (await userHasAnyPermission(req, codes)) return next();
      return res.status(403).json({ success: false, message: `${label} required` });
    } catch (err) {
      console.error(`[authz] permission check failed: ${err.message}`);
      return res.status(503).json({
        success: false,
        message: "Permission check unavailable. Please try again.",
      });
    }
  };
}

function clearPermissionCache() {
  cache.clear();
}

module.exports = { userHasAnyPermission, requireAnyPermission, clearPermissionCache, extractCodes };
