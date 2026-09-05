require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const sequelizeConnection = require("./config/database");

const corsOrigin =
  process.env.CORS_ORIGIN === "*"
    ? true
    : (process.env.CORS_ORIGIN || "http://localhost:5173")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
app.use(cors({ origin: corsOrigin, credentials: true }));

if (!process.env.INTERNAL_SERVICE_KEY) {
  console.error(
    "[Creator] INTERNAL_SERVICE_KEY is not set — CREATOR_USER AuthZ sync on approve will fail.",
  );
}

const applicationRoutes = require("./routes/application.routes");
const profileRoutes = require("./routes/profile.routes");
const planRoutes = require("./routes/plan.routes");
const daySlotRoutes = require("./routes/daySlot.routes");
const importRoutes = require("./routes/import.routes");
const catalogRoutes = require("./routes/catalog.routes");
const reportRoutes = require("./routes/report.routes");
const healthRoutes = require("./routes/health.routes");

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  if (req.url === "/creator" || req.url.startsWith("/creator/")) {
    req.url = req.url.slice("/creator".length) || "/";
  }
  next();
});

app.get("/", (req, res) => {
  res.send("Creator service running.....");
});

app.use("/applications", applicationRoutes);
app.use("/", profileRoutes);
app.use("/me/plans", planRoutes);
app.use("/me/plans", daySlotRoutes);
app.use("/", importRoutes);
app.use("/catalog", catalogRoutes);
app.use("/internal/reports", reportRoutes);
app.use("/internal/rollup", require("./routes/internal.routes"));
app.use("/health", healthRoutes);

sequelizeConnection
  .authenticate()
  .then(() => {
    console.log("Database connection has been established successfully.");
    return sequelizeConnection.sync();
  })
  .then(() => {
    const PORT = process.env.PORT || 6011;
    app.listen(PORT, () => {
      console.log(`Creator service running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Error occurred while syncing database: ", err);
  });

module.exports = app;
