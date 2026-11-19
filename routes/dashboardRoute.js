
const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");

const {
  getDashboardStats,
} = require("../controllers/dashboardController");

// Hospital administrator dashboard statistics.
router.get(
  "/stats",
  auth,
  authorize("admin"),
  getDashboardStats
);

module.exports = router;