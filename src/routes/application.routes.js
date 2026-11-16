const express = require("express");
const router = express.Router();
const extractUser = require("../middlerware/extractUser");
const ctrl = require("../controllers/application.controller");
const { requireAnyPermission } = require("../lib/authzPermissions");

// S6: creator-application review is admin-only. Previously these routes had no
// authentication or permission check at all.
const reviewer = [
  extractUser,
  requireAnyPermission(["POS.CREATOR.APPLICATION.REVIEW"], "Creator application review permission"),
];

router.post("/", extractUser, ctrl.saveDraft);
router.post("/me/submit", extractUser, ctrl.submitApplication);
router.get("/me", extractUser, ctrl.getMyApplication);

// Admin — order matters: static paths before :applicationId
router.get("/internal/pending", reviewer, ctrl.listPending);
router.get("/internal/creators", reviewer, ctrl.listCreators);
router.get("/internal", reviewer, ctrl.listApplications);
router.get("/internal/:applicationId", reviewer, ctrl.getById);
router.post("/internal/:applicationId/review", reviewer, ctrl.reviewApplication);
router.post("/internal/:applicationId/resync-roles", reviewer, ctrl.resyncRoles);

module.exports = router;
