const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const requireHospitalAdmin = require('../middleware/requireHospitalAdmin');
const { bootstrapHospital, createInvitation, acceptInvitation, revokeInvitation, listAuditLogs } = require('../controllers/onboardingController');

// One-time bootstrap protected by a high-entropy server-side secret.
router.post('/bootstrap', bootstrapHospital);
// Public only with a valid one-time invitation token.
router.post('/accept-invitation', acceptInvitation);
// All invitation administration and audit access are hospital-admin-only.
router.post('/invitations', auth, requireHospitalAdmin, createInvitation);
router.delete('/invitations/:id', auth, requireHospitalAdmin, revokeInvitation);
router.get('/audit-logs', auth, requireHospitalAdmin, listAuditLogs);

module.exports = router;
