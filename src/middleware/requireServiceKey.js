"use strict";
/**
 * Internal endpoint guard — uses the shared dual-key helper (A7, src/lib/serviceKey.js).
 * Fails closed (503 when INTERNAL_SERVICE_KEY is unset), constant-time comparison, and also
 * accepts INTERNAL_SERVICE_KEY_PREVIOUS during a key rotation. Key values are never logged.
 */
const serviceKey = require("../lib/serviceKey");

function requireServiceKey(req, res, next) {
  return serviceKey.requireServiceKey(req, res, next);
}

module.exports = requireServiceKey;
module.exports.requireServiceKey = requireServiceKey;
