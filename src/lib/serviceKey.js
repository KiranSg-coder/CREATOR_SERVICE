"use strict";
/**
 * Service-to-service key check — ONE implementation for every service (A7 / P0-R6).
 *
 * SOURCE OF TRUTH: MICROSERVICES/_shared/serviceKey.js
 * Each service has a byte-identical copy at src/lib/serviceKey.js (services deploy
 * separately). Edit the source, then run:  node MICROSERVICES/scripts/sync-service-key.js
 * tests/security/serviceKeyShared.test.js fails if any copy drifts.
 *
 * Dual-key rotation (no downtime):
 *   1. On every service set INTERNAL_SERVICE_KEY_PREVIOUS = old key and
 *      INTERNAL_SERVICE_KEY = new key, then restart. Receivers accept both; senders
 *      always send INTERNAL_SERVICE_KEY (the new one).
 *   2. When the "previous key used" warning has stopped appearing everywhere,
 *      remove INTERNAL_SERVICE_KEY_PREVIOUS and restart.
 *
 * Rules: fails closed (no current key -> internal endpoints answer 503); the previous key
 * is only accepted while a current key is set; comparison is constant-time and checks
 * every configured key; key values are never logged.
 */
const crypto = require("crypto");

let warnedMissingKey = false;
let warnedPreviousUsed = false;

function currentKey() {
  const v = process.env.INTERNAL_SERVICE_KEY;
  return v ? String(v) : "";
}

function previousKey() {
  const v = process.env.INTERNAL_SERVICE_KEY_PREVIOUS;
  return v ? String(v) : "";
}

/** True when this service can authenticate internal calls at all. */
function isServiceKeyConfigured() {
  return Boolean(currentKey());
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

/** Constant-time check of a provided key against the current and (optional) previous key. */
function isValidServiceKey(provided) {
  const current = currentKey();
  if (!current || provided == null || provided === "") return false;
  const p = digest(Array.isArray(provided) ? provided[0] : provided);
  const matchCurrent = crypto.timingSafeEqual(p, digest(current));
  const prev = previousKey();
  const matchPrevious = prev ? crypto.timingSafeEqual(p, digest(prev)) : false;
  if (matchPrevious && !matchCurrent && !warnedPreviousUsed) {
    warnedPreviousUsed = true;
    console.warn("[internal] A request used INTERNAL_SERVICE_KEY_PREVIOUS — some caller still sends the old key.");
  }
  return matchCurrent || matchPrevious;
}

/** True only when the request carries a valid x-service-key. */
function hasValidServiceKey(req) {
  return isValidServiceKey(req && req.headers ? req.headers["x-service-key"] : null);
}

/** Express middleware protecting internal endpoints. */
function requireServiceKey(req, res, next) {
  if (!isServiceKeyConfigured()) {
    if (!warnedMissingKey) {
      console.error("[internal] INTERNAL_SERVICE_KEY is not set — internal endpoints are disabled until it is configured.");
      warnedMissingKey = true;
    }
    return res.status(503).json({
      success: false,
      error: {
        code: "SERVICE_AUTH_NOT_CONFIGURED",
        message: "Internal endpoint unavailable: service authentication is not configured.",
      },
    });
  }
  if (hasValidServiceKey(req)) return next();
  return res.status(401).json({
    success: false,
    error: { code: "UNAUTHORIZED", message: "Valid x-service-key required" },
  });
}

/** The key this service sends on outgoing internal calls (always the current one). */
function outgoingServiceKey() {
  return currentKey();
}

module.exports = {
  isServiceKeyConfigured,
  isValidServiceKey,
  hasValidServiceKey,
  requireServiceKey,
  outgoingServiceKey,
};
