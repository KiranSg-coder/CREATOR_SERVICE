"use strict";
/**
 * Gate platform admin analytics routes (production review S6).
 *
 * DEFAULT DENY. The caller's permissions are checked server-side against the
 * Authorization service using their verified token. Client headers such as
 * x-is-admin / x-permissions / x-roles are ignored, and the old
 * ADMIN_ANALYTICS_OPEN fallback (which let any signed-in user through) is removed.
 * Internal service calls (req.isInternal, set only after a valid x-service-key) pass.
 */
const { requireAnyPermission } = require("../lib/authzPermissions");

const ADMIN_ANALYTICS_CODES = [
  "TENANT_USER_ADMIN",
  "AUTHZ.ANALYTICS.VIEW",
  "AUTHZ.ROLE.VIEW",
];

module.exports = requireAnyPermission(ADMIN_ANALYTICS_CODES, "Admin analytics permission");
module.exports.ADMIN_ANALYTICS_CODES = ADMIN_ANALYTICS_CODES;
