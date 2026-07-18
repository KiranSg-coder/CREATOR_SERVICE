const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/report.controller");

router.get("/open", ctrl.listOpenReports);
router.post("/:reportId/resolve", ctrl.resolveReport);

module.exports = router;
