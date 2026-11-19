
const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const upload = require("../middleware/uploadMiddleware");
const idempotency = require("../middleware/idempotency");
const auditAction = require("../middleware/auditAction");
const {
  createPatient,
  getPatients,
  getPatientById,
  exportPDF,
  deletePatient,
  updatePatient,
} = require("../controllers/patientController");

/**
 * @swagger
 * /api/v1/patients:
 *   get:
 *     summary: Get, search and filter patients
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         schema: { type: string }
 *       - in: query
 *         name: gender
 *         schema: { type: string, enum: [male, female] }
 *       - in: query
 *         name: diagnosis
 *         schema: { type: string }
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *         description: Match a date contained in the patient's dateOfVisits array.
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *     responses:
 *       200:
 *         description: Paginated patient list.
 *       401:
 *         description: Unauthorized.
 */
router.get("/", auth, auditAction("patient.list_viewed", "patient"), getPatients);

/**
 * @swagger
 * /api/v1/patients:
 *   post:
 *     summary: Register a patient
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         schema: { type: string }
 *         required: false
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, age, gender, diagnosis, treatment]
 *             properties:
 *               name: { type: string }
 *               age: { type: integer }
 *               gender: { type: string, enum: [male, female] }
 *               dateOfVisits:
 *                 type: array
 *                 items: { type: string, format: date }
 *               diagnosis: { type: string }
 *               treatment: { type: string }
 *               notes: { type: string }
 *               files:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Patient created.
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized.
 */
router.post("/", auth, idempotency, upload.array("files"), auditAction("patient.created", "patient"), createPatient);

/**
 * @swagger
 * /api/v1/patients/{id}:
 *   get:
 *     summary: Get one patient's complete profile
 *     description: Returns the latest saved patient record for direct profile links and browser refreshes.
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Patient profile retrieved.
 *       400:
 *         description: Invalid patient ID.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Patient not found.
 */
router.get("/:id", auth, auditAction("patient.viewed", "patient"), getPatientById);

/**
 * @swagger
 * /api/v1/patients/{id}:
 *   patch:
 *     summary: Update a patient
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PatientUpdate' }
 *     responses:
 *       200:
 *         description: Patient updated.
 *       400:
 *         description: Invalid ID or validation error.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Patient not found.
 */
router.patch("/:id", auth, auditAction("patient.updated", "patient"), updatePatient);

/**
 * @swagger
 * /api/v1/patients/{id}:
 *   delete:
 *     summary: Delete a patient
 *     description: Both doctors and nurses may delete patient records.
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Patient deleted.
 *       400:
 *         description: Invalid patient ID.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Role not permitted.
 *       404:
 *         description: Patient not found.
 */
router.delete("/:id", auth, authorize("doctor", "nurse"), auditAction("patient.deleted", "patient"), deletePatient);

/**
 * @swagger
 * /api/v1/patients/{id}/export:
 *   get:
 *     summary: Export a patient record as PDF
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: PDF document.
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       404:
 *         description: Patient not found.
 */
router.get("/:id/export", auth, auditAction("patient.exported", "patient"), exportPDF);

module.exports = router;
