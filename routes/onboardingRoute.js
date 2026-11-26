
const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const requireHospitalAdmin = require("../middleware/requireHospitalAdmin");

const {
  bootstrapHospital,
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  listAuditLogs,
} = require("../controllers/onboardingController");

// One-time hospital setup.
router.post("/bootstrap", bootstrapHospital);

// Accept a valid staff invitation.
router.post("/accept-invitation", acceptInvitation);

// Hospital administrator-only invitation management.
router.post(
  "/invitations",
  auth,
  requireHospitalAdmin,
  createInvitation
);

router.delete(
  "/invitations/:id",
  auth,
  requireHospitalAdmin,
  revokeInvitation
);

// All authenticated hospital staff can view their hospital's audit logs.
router.get("/audit-logs", auth, (req, res, next) => {
  const allowedRoles = ["admin", "doctor", "nurse"];

  if (
    !req.user?.hospitalId ||
    !allowedRoles.includes(String(req.user.role).toLowerCase())
  ) {
    return res.status(403).json({
      success: false,
      message: "You are not authorized to view audit logs.",
    });
  }

  next();
}, listAuditLogs);

module.exports = router;
