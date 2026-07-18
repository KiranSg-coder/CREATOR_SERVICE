const express = require("express");
const router = express.Router();
const extractUser = require("../middlerware/extractUser");
const ctrl = require("../controllers/application.controller");

router.post("/", extractUser, ctrl.saveDraft);
router.post("/me/submit", extractUser, ctrl.submitApplication);
router.get("/me", extractUser, ctrl.getMyApplication);

router.get("/internal/pending", ctrl.listPending);
router.get("/internal/:applicationId", ctrl.getById);
router.post("/internal/:applicationId/review", ctrl.reviewApplication);

module.exports = router;
