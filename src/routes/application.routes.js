const express = require("express");
const router = express.Router();
const extractUser = require("../middlerware/extractUser");
const ctrl = require("../controllers/application.controller");

router.post("/", extractUser, ctrl.saveDraft);
router.post("/me/submit", extractUser, ctrl.submitApplication);
router.get("/me", extractUser, ctrl.getMyApplication);

// Admin — order matters: static paths before :applicationId
router.get("/internal/pending", ctrl.listPending);
router.get("/internal/creators", ctrl.listCreators);
router.get("/internal", ctrl.listApplications);
router.get("/internal/:applicationId", ctrl.getById);
router.post("/internal/:applicationId/review", ctrl.reviewApplication);
router.post("/internal/:applicationId/resync-roles", ctrl.resyncRoles);

module.exports = router;
