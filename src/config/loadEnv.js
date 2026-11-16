/**
 * Environment loader (Phase 1). Replaces every `require("dotenv").config()` in this service.
 *
 * One `.env` per service holds BOTH environments:
 *   APP_ENV=local | production   selects which block is applied
 *   KEY=value                     shared by both environments
 *   LOCAL_KEY=value               becomes KEY when APP_ENV=local
 *   PROD_KEY=value                becomes KEY when APP_ENV=production
 *
 * Precedence: variable set by the OS / IIS  >  LOCAL_/PROD_ value  >  shared value.
 * Empty LOCAL_/PROD_ values are ignored, so a blank PROD_DB_PASSWORD makes startup fail closed.
 * Values are never logged.
 * STREAKLY_ENV_FILE=<path> selects another file; STREAKLY_ENV_FILE=none loads no file (tests).
 */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const PREFIX_BY_ENV = { local: "LOCAL_", development: "LOCAL_", production: "PROD_", prod: "PROD_" };
const PREFIX_RE = /^(LOCAL|PROD)_/;

function loadEnv() {
  if (global.__STREAKLY_ENV__) return global.__STREAKLY_ENV__;

  const setByOs = new Set(Object.keys(process.env)); // snapshot before anything from .env is applied
  // STREAKLY_ENV_FILE: explicit path to the .env file, or "none" to load no file (used by tests).
  const override = String(process.env.STREAKLY_ENV_FILE || "").trim();
  const candidates = override
    ? (override.toLowerCase() === "none" ? [] : [override])
    : [path.join(__dirname, "..", "..", ".env"), path.join(process.cwd(), ".env")];
  const file = candidates.find((p) => fs.existsSync(p)) || null;
  const parsed = file ? dotenv.parse(fs.readFileSync(file)) : {};

  for (const [k, v] of Object.entries(parsed)) {
    if (!PREFIX_RE.test(k) && !setByOs.has(k)) process.env[k] = v;
  }

  const appEnv = String(process.env.APP_ENV || "").trim().toLowerCase();
  const source = { ...parsed };
  for (const k of setByOs) if (PREFIX_RE.test(k)) source[k] = process.env[k];
  const hasBlocks = Object.keys(source).some((k) => PREFIX_RE.test(k));

  if (!appEnv) {
    if (hasBlocks) {
      throw new Error('[config] APP_ENV is not set. Set APP_ENV=local or APP_ENV=production in this service\'s .env file.');
    }
    return (global.__STREAKLY_ENV__ = { appEnv: null, file });
  }
  const prefix = PREFIX_BY_ENV[appEnv];
  if (!prefix) throw new Error('[config] APP_ENV must be "local" or "production".');

  for (const [k, v] of Object.entries(source)) {
    if (!k.startsWith(prefix)) continue;
    const base = k.slice(prefix.length);
    if (!base || setByOs.has(base) || v === undefined || String(v).trim() === "") continue;
    process.env[base] = v;
  }
  return (global.__STREAKLY_ENV__ = { appEnv: prefix === "PROD_" ? "production" : "local", file });
}

module.exports = loadEnv();
module.exports.loadEnv = loadEnv;
