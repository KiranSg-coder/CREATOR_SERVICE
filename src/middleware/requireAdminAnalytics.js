/**
 * Gate platform admin analytics routes.
 * Same contract as SUBSCRIPTION_SERVICE requireAdminAnalytics.
 */

const ALLOWED_CODES = new Set([
  "TENANT_USER_ADMIN",
  "AUTHZ.ANALYTICS.VIEW",
  "AUTHZ.ROLE.VIEW",
]);

function splitHeader(value) {
  if (value == null || value === "") return [];
  return String(value)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function collectCodes(req) {
  return [
    ...splitHeader(req.headers["x-permission-codes"]),
    ...splitHeader(req.headers["x-permissions"]),
    ...splitHeader(req.headers["x-roles"]),
  ];
}

function hasAdminAnalyticsPermission(req) {
  if (req.headers["x-is-admin"] === "1") return true;
  return collectCodes(req).some((c) => ALLOWED_CODES.has(c));
}

function hasPermissionHeaders(req) {
  return (
    Boolean(req.headers["x-permission-codes"]) ||
    Boolean(req.headers["x-permissions"]) ||
    Boolean(req.headers["x-roles"]) ||
    req.headers["x-is-admin"] != null
  );
}

const requireAdminAnalytics = (req, res, next) => {
  if (req.isInternal) {
    return next();
  }

  if (!req.userId) {
    return res.status(401).json({
      success: false,
      message: "Missing user context",
    });
  }

  if (hasAdminAnalyticsPermission(req)) {
    return next();
  }

  const openFallback = process.env.ADMIN_ANALYTICS_OPEN !== "false";

  if (hasPermissionHeaders(req)) {
    return res.status(403).json({
      success: false,
      message: "Admin analytics permission required",
    });
  }

  if (openFallback) {
    console.warn(
      "[requireAdminAnalytics] Allowing authenticated user without admin permission headers " +
        `(userId=${req.userId}). Set ADMIN_ANALYTICS_OPEN=false to enforce.`
    );
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Admin analytics permission required",
  });
};

module.exports = requireAdminAnalytics;
