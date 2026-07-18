const express = require("express");
const multer = require("multer");
const router = express.Router();
const extractUser = require("../middlerware/extractUser");
const ctrl = require("../controllers/import.controller");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    const name = (file.originalname || "").toLowerCase();
    const ok =
      name.endsWith(".csv") ||
      name.endsWith(".xlsx") ||
      name.endsWith(".xlsm") ||
      (file.mimetype || "").includes("csv") ||
      (file.mimetype || "").includes("spreadsheet") ||
      (file.mimetype || "").includes("excel") ||
      file.mimetype === "application/octet-stream";
    if (!ok) {
      return cb(new Error("Only .csv or .xlsx files are allowed"));
    }
    cb(null, true);
  },
});

function handleUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
}

router.get("/plans/import-templates/csv", ctrl.downloadCsvTemplate);
router.get("/plans/import-templates/xlsx", ctrl.downloadXlsxTemplate);

// Multipart preferred; JSON { inputFileUuid } also supported (same handler).
router.post(
  "/me/plans/:planId/import-jobs",
  extractUser,
  handleUpload,
  ctrl.createImportJob
);
router.get(
  "/me/plans/:planId/import-jobs/:jobId",
  extractUser,
  ctrl.getImportJob
);

module.exports = router;
