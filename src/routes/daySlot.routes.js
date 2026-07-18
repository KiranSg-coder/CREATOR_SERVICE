const express = require("express");
const router = express.Router();
const extractUser = require("../middlerware/extractUser");
const ctrl = require("../controllers/daySlot.controller");

router.post("/:planId/days", extractUser, ctrl.upsertDay);
router.patch("/:planId/days/:dayId", extractUser, ctrl.upsertDay);
router.delete("/:planId/days/:dayId", extractUser, ctrl.deleteDay);

router.post("/:planId/days/:dayId/slots", extractUser, ctrl.upsertSlot);
router.patch("/:planId/slots/:slotId", extractUser, ctrl.upsertSlot);
router.delete("/:planId/slots/:slotId", extractUser, ctrl.deleteSlot);

router.post("/:planId/slots/reorder", extractUser, ctrl.reorderSlots);

module.exports = router;
