"use strict";

/**
 * Safe error responses (production review S12 + P0-R4 / A6).
 *
 * SOURCE OF TRUTH: MICROSERVICES/_shared/safeErrorResponses.js
 * Each service has a byte-identical copy at src/middleware/safeErrorResponses.js.
 * Edit the source, then run:  node MICROSERVICES/scripts/sync-service-key.js
 *
 * Outside local development (NODE_ENV not development/test):
 *  1. 5xx JSON bodies are replaced by a generic message that keeps a machine-readable
 *     error.code and the correlation id (unchanged since S12).
 *  2. P0-R4: ANY other JSON body (2xx with success:false, 4xx) is scrubbed of internal error
 *     text — SQL Server / driver errors, network errors, JavaScript runtime errors and stack
 *     traces — and of debug fields (stack, sql, original, parent). Business and validation
 *     messages users need (e.g. "That email is already registered") are left as they are.
 *  3. The scrubbed original text is logged server-side with the correlation id (truncated,
 *     one line) so support can still diagnose it.
 */
const GENERIC_MESSAGE = "Something went wrong. Please try again.";

// Text that only internal failures produce. Kept specific so real user messages pass through.
const INTERNAL_TEXT = new RegExp(
  [
    "Invalid (column|object) name",
    "Incorrect syntax near",
    "Conversion failed",
    "Violation of (PRIMARY|UNIQUE) KEY",
    "Cannot insert (the value NULL|duplicate key)",
    "The (INSERT|UPDATE|DELETE|MERGE) statement conflicted",
    "Arithmetic overflow",
    "String or binary data would be truncated",
    "Procedure or function .* expects parameter",
    "Could not find stored procedure",
    "Named replacement",
    "Sequelize[A-Za-z]*Error",
    "Login failed for user",
    "Failed to connect to",
    "Connection lost",
    "deadlocked on lock",
    "Timeout: Request failed",
    "Request failed with status code \\d{3}",
    "\\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|EAI_AGAIN)\\b",
    "socket hang up",
    "getaddrinfo",
    "Cannot read propert(y|ies) of",
    "is not (a function|defined|iterable)",
    "Unexpected token .* in JSON",
    "\\bat [\\w.<>$]+ \\(.+:\\d+:\\d+\\)",
    "[A-Za-z]:\\\\.+\\.js",
    "/node_modules/",
  ].join("|"),
  "i",
);
const DEBUG_FIELDS = ["stack", "sql", "sqlMessage", "original", "parent", "errors_raw"];

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

function isInternalText(value) {
  return typeof value === "string" && INTERNAL_TEXT.test(value);
}

/**
 * Scrub internal error text from a non-5xx body. Returns { body, scrubbed: string[] }.
 * Only touches failure-shaped bodies (success === false, or an error field present).
 */
function scrubBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { body, scrubbed: [] };
  const failure = body.success === false || "error" in body || "errors" in body || "details" in body;
  if (!failure) return { body, scrubbed: [] };
  const scrubbed = [];
  const out = { ...body };
  for (const f of DEBUG_FIELDS) {
    if (f in out) { scrubbed.push(`${f}`); delete out[f]; }
  }
  for (const f of ["message", "details", "msg"]) {
    if (isInternalText(out[f])) { scrubbed.push(String(out[f])); out[f] = GENERIC_MESSAGE; }
  }
  if (isInternalText(out.error)) {
    scrubbed.push(String(out.error));
    out.error = { code: "INTERNAL_ERROR", message: GENERIC_MESSAGE };
  } else if (out.error && typeof out.error === "object" && !Array.isArray(out.error)) {
    const e = { ...out.error };
    for (const f of DEBUG_FIELDS) if (f in e) { scrubbed.push(f); delete e[f]; }
    for (const f of ["message", "details"]) {
      if (isInternalText(e[f])) { scrubbed.push(String(e[f])); e[f] = GENERIC_MESSAGE; }
    }
    out.error = e;
  }
  if (Array.isArray(out.errors)) {
    out.errors = out.errors.map((x) => {
      if (isInternalText(x)) { scrubbed.push(String(x)); return GENERIC_MESSAGE; }
      if (x && typeof x === "object" && isInternalText(x.message)) {
        scrubbed.push(String(x.message));
        return { ...x, message: GENERIC_MESSAGE };
      }
      return x;
    });
  }
  return { body: out, scrubbed };
}

function logScrubbed(req, status, scrubbed) {
  try {
    console.error(JSON.stringify({
      event: "error_text_scrubbed",
      correlationId: req.correlationId || req.headers["x-correlation-id"] || null,
      method: req.method,
      path: String(req.originalUrl || req.url || "").split("?")[0],
      status,
      detail: scrubbed.map((s) => String(s).replace(/\s+/g, " ").slice(0, 300)),
    }));
  } catch { /* never throw from logging */ }
}

function safeErrorResponses(req, res, next) {
  if (isDevelopment()) return next();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const correlationId = req.correlationId || req.headers["x-correlation-id"];
    if (res.statusCode >= 500 && body && typeof body === "object") {
      return originalJson(sanitizeServerErrorBody(body, correlationId));
    }
    const { body: clean, scrubbed } = scrubBody(body);
    if (scrubbed.length) {
      logScrubbed(req, res.statusCode, scrubbed);
      if (correlationId && clean && typeof clean === "object" && !clean.correlationId) {
        clean.correlationId = String(correlationId);
      }
    }
    return originalJson(clean);
  };
  return next();
}

module.exports = safeErrorResponses;
module.exports.sanitizeServerErrorBody = sanitizeServerErrorBody;
module.exports.scrubBody = scrubBody;
module.exports.isInternalText = isInternalText;
module.exports.GENERIC_MESSAGE = GENERIC_MESSAGE;
