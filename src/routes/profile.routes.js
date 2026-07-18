const express = require("express");
const router = express.Router();
const extractUser = require("../middlerware/extractUser");
const ctrl = require("../controllers/profile.controller");

router.get("/me/profile", extractUser, ctrl.getOwnProfile);
router.put("/me/profile", extractUser, ctrl.upsertProfile);
router.get("/public/creators/:userId", ctrl.getPublicProfile);

module.exports = router;
