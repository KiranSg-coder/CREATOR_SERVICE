const express = require("express");
const router = express.Router();
const catalogCtrl = require("../controllers/catalog.controller");

router.post("/sync", catalogCtrl.syncRollup);

module.exports = router;
