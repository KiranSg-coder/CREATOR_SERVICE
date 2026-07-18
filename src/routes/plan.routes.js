const express = require("express");
const router = express.Router();
const extractUser = require("../middlerware/extractUser");
const ctrl = require("../controllers/plan.controller");

router.post("/", extractUser, ctrl.createPlan);
router.get("/", extractUser, ctrl.listMyPlans);
router.get("/:planId", extractUser, ctrl.getPlanDetail);
router.patch("/:planId", extractUser, ctrl.updateMetadata);
router.put("/:planId", extractUser, ctrl.updateMetadata);
router.delete("/:planId", extractUser, ctrl.deletePlan);
router.post("/:planId/publish", extractUser, ctrl.publishPlan);
router.post("/:planId/archive", extractUser, ctrl.archivePlan);
router.post("/:planId/unlist", extractUser, ctrl.unlistPlan);
router.post("/:planId/versions", extractUser, ctrl.createNewVersion);
router.put("/:planId/tags", extractUser, ctrl.replaceTags);

module.exports = router;
