const express = require("express");
const router = express.Router();
const extractUser = require("../middlerware/extractUser");
const ctrl = require("../controllers/catalog.controller");

router.get("/plans", ctrl.searchCatalog);
router.get("/plans/:planId", ctrl.getCatalogPlan);
router.get("/tags/suggest", ctrl.suggestTags);
router.post("/plans/:planId/reports", extractUser, ctrl.submitReport);

module.exports = router;
