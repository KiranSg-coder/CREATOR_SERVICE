const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/health.controller");

router.get("/", ctrl.healthCheck);
router.get("/db", ctrl.dbHealthCheck);

module.exports = router;
