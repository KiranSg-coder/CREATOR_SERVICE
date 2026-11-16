"use strict";

/**
 * Safe error responses (production review S12).
 *
 * Outside local development, a 5xx JSON response never reaches the client with raw
 * internal text (SQL errors, stack fragments, upstream bodies). The body is replaced by a
 * generic message that keeps a machine-readable `error.code` and the correlation id, so
 * support can still trace the failure in server logs.
 *
 * Raw messages are shown only when NODE_ENV=development or NODE_ENV=test.
 * 4xx responses (validation and business messages) are left unchanged.
 */
const GENERIC_MESSAGE = "Something went wrong. Please try again.";

function isDevelopment() {
  const env = String(process.env.NODE_ENV || "").toLowerCase();
  return env === "development" || env === "test";
}

function safeErrorCode(body) {
  const raw =
    (body && typeof body.error === "object" && body.error && body.error.code) ||
    (body && typeof body.code === "string" && body.code) ||
    "INTERNAL_ERROR";
  return /^[A-Z0-9_.-]{1,64}$/.test(String(raw)) ? String(raw) : "INTERNAL_ERROR";
}

function sanitizeServerErrorBody(body, correlationId) {
  return {
    success: false,
    message: GENERIC_MESSAGE,
    error: { code: safeErrorCode(body), message: GENERIC_MESSAGE },
    ...(correlationId ? { correlationId: String(correlationId) } : {}),
  };
}

function safeErrorResponses(req, res, next) {
  if (isDevelopment()) return next();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === "object") {
      const correlationId = req.correlationId || req.headers["x-correlation-id"];
      return originalJson(sanitizeServerErrorBody(body, correlationId));
    }
    return originalJson(body);
  };
  return next();
}

module.exports = safeErrorResponses;
module.exports.sanitizeServerErrorBody = sanitizeServerErrorBody;
module.exports.GENERIC_MESSAGE = GENERIC_MESSAGE;
