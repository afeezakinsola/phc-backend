
const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");

const {
  getHospitalProfile,
  updateHospitalProfile,
} = require("../controllers/hospitalController");

// View hospital profile - administrator only.
router.get(
  "/profile",
  auth,
  authorize("admin"),
  getHospitalProfile
);

// Update hospital profile - administrator only.
router.patch(
  "/profile",
  auth,
  authorize("admin"),
  updateHospitalProfile
);

module.exports = router;
