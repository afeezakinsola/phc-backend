
const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const { getAuditLogs } = require("../controllers/auditLogController");

// All authenticated hospital staff can view their hospital's audit logs.
router.get("/", auth, (req, res, next) => {
  const allowedRoles = ["admin", "doctor", "nurse"];

  if (!allowedRoles.includes(String(req.user.role).toLowerCase())) {
    return res.status(403).json({
      success: false,
      message: "You are not authorized to view audit logs.",
    });
  }

  next();
}, getAuditLogs);

module.exports = router;
