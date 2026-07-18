const { Sequelize } = require("sequelize");

const DB_NAME = process.env.DB_NAME || "CREATOR_SERVICE";
const DB_USER = process.env.DB_USER || "auth";
const DB_PASSWORD = process.env.DB_PASSWORD || "1234";
const DB_HOST = process.env.DB_HOST || "DESKTOP-C1F49GD";
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined;

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  ...(DB_PORT ? { port: DB_PORT } : {}),
  dialect: "mssql",
  logging: false,
  dialectOptions: {
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
  },
  pool: {
    max: 5,
    min: 0,
    idle: 30000,
  },
});

module.exports = sequelize;
