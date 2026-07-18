const sequelize = require("../config/database");

const healthCheck = async (_req, res) => {
  return res.status(200).json({ status: "ok" });
};

const dbHealthCheck = async (_req, res) => {
  try {
    await sequelize.authenticate();
    return res.status(200).json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("dbHealthCheck error:", error.message);
    return res
      .status(503)
      .json({ status: "error", database: "disconnected", message: error.message });
  }
};

module.exports = {
  healthCheck,
  dbHealthCheck,
};
