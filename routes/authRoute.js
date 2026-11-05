


const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const {
  register,
  login,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
} = require("../controllers/authController");

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a doctor or nurse account
 *     description: Public registration is currently enabled. See the deployment security note before production use.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string, enum: [doctor, nurse] }
 *     responses:
 *       201:
 *         description: Account registered.
 *       400:
 *         description: Validation error.
 *       409:
 *         description: Email already registered.
 */
router.post("/register", register);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Log in a staff member
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful; returns a JWT and public user details.
 *       400:
 *         description: Invalid credentials or validation error.
 */
router.post("/login", login);

/**
 * @swagger
 * /api/v1/auth/users:
 *   get:
 *     summary: List all doctor and nurse accounts
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Staff list. Password hashes are excluded.
 *       401:
 *         description: Unauthorized.
 */
router.get("/users", auth, getUsers);

/**
 * @swagger
 * /api/v1/auth/users/{id}:
 *   get:
 *     summary: Get one staff profile
 *     description: Doctors and nurses may view individual staff profiles.
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Staff profile retrieved. Password hash is excluded.
 *       400:
 *         description: Invalid staff ID.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Staff member not found.
 *   patch:
 *     summary: Update a staff profile
 *     description: Doctors only. Only name, email and role can be updated; password updates are not accepted here.
 *     tags: [Staff]
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
 *           schema: { $ref: '#/components/schemas/StaffUpdate' }
 *     responses:
 *       200:
 *         description: Staff profile updated.
 *       400:
 *         description: Invalid ID or validation error.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Doctor access required.
 *       404:
 *         description: Staff member not found.
 *       409:
 *         description: Email conflict or last-doctor protection.
 *   delete:
 *     summary: Delete a staff account
 *     description: Doctors only. A doctor cannot delete their own active account or the final doctor account.
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Staff account deleted.
 *       400:
 *         description: Invalid ID or attempted self-deletion.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Doctor access required.
 *       404:
 *         description: Staff member not found.
 *       409:
 *         description: Cannot delete the final doctor account.
 */
router.get("/users/:id", auth, getUserById);
router.patch("/users/:id", auth, authorize("doctor"), updateUser);
router.delete("/users/:id", auth, authorize("doctor"), deleteUser);

module.exports = router;
