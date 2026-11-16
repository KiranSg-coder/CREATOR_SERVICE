"use strict";
/**
 * Database connection — security hardened (production review S1 / S2).
 *
 * - No credential fallbacks. DB_USER, DB_PASSWORD and DB_HOST must be supplied by the
 *   environment (.env locally, a protected secret store in production). The service
 *   refuses to start when they are missing instead of silently using a shared admin login.
 * - Each service should use its own least-privilege SQL login (see
 *   STREAKLY_RELEASE_AND_DEPLOYMENT_CHECKLIST.md). Never use "sa".
 * - Transport encryption is always on. The SQL Server certificate is validated.
 *   DB_TRUST_SERVER_CERTIFICATE=true is honoured ONLY when NODE_ENV=development
 *   (local self-signed certificates); it is rejected everywhere else.
 * - Credential values are never logged.
 */
require("./loadEnv");
const { Sequelize } = require("sequelize");

const DEFAULT_DB_NAME = "CREATOR_SERVICE";
const NODE_ENV = String(process.env.NODE_ENV || "").toLowerCase();
const IS_DEVELOPMENT = NODE_ENV === "development" || NODE_ENV === "test";

function requireEnv(name) {
  const value = process.env[name];
  if (value == null || String(value).trim() === "") {
    throw new Error(
      `[config] Missing required environment variable ${name}. ` +
        "Set it in this service's environment (.env locally or the production secret store).",
    );
  }
  return String(value);
}

const trustServerCertificate =
  String(process.env.DB_TRUST_SERVER_CERTIFICATE || "").toLowerCase() === "true";
if (trustServerCertificate && !IS_DEVELOPMENT) {
  throw new Error(
    "[config] DB_TRUST_SERVER_CERTIFICATE=true is only allowed when NODE_ENV=development. " +
      "Install a certificate trusted by this host on SQL Server instead.",
  );
}

let port;
if (process.env.DB_PORT) {
  port = Number(process.env.DB_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("[config] DB_PORT must be a positive integer.");
  }
}

const sequelize = new Sequelize(
  process.env.DB_NAME || DEFAULT_DB_NAME,
  requireEnv("DB_USER"),
  requireEnv("DB_PASSWORD"),
  {
    host: requireEnv("DB_HOST"),
    ...(port ? { port } : {}),
    dialect: "mssql",
    logging: false,
    dialectOptions: {
      options: {
        encrypt: true,
        trustServerCertificate,
        ...(process.env.DB_INSTANCE_NAME
          ? { instanceName: process.env.DB_INSTANCE_NAME }
          : {}),
      },
    },
    pool: {
      max: 5,
      min: 0,
      idle: 30000,
    },
  },
);

module.exports = sequelize;
