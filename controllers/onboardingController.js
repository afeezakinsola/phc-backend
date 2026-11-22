const mongoose = require('mongoose');
const StaffSequence = require('../models/staffSequence');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const Hospital = require('../models/hospital');
const User = require('../models/user');
const Invitation = require('../models/invitation');
const writeAuditLog = require('../utils/writeAuditLog');

const bootstrapSchema = Joi.object({
  hospitalName: Joi.string().trim().min(2).max(120).required(),
  hospitalCode: Joi.string().trim().uppercase().pattern(/^[A-Z0-9-]{3,20}$/).required(),
  adminName: Joi.string().trim().min(2).max(100).required(),
  adminEmail: Joi.string().trim().lowercase().email().required(),
  adminPassword: Joi.string().min(12).required(),
});
const inviteSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().trim().lowercase().email().required(),
  role: Joi.string().valid('doctor', 'nurse').required(),
});
const acceptSchema = Joi.object({ token: Joi.string().hex().length(64).required(), password: Joi.string().min(12).required() });
const staffIdPrefix = { admin: 'ADM', doctor: 'DOC', nurse: 'NUR' };


exports.bootstrapHospital = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    // 1. Verify the private bootstrap secret.
    const configuredSecret = process.env.HOSPITAL_BOOTSTRAP_SECRET;
    const suppliedSecret = req.get('x-bootstrap-secret') || '';

    const suppliedBuffer = Buffer.from(suppliedSecret);
    const configuredBuffer = Buffer.from(configuredSecret || '');

    if (
      !configuredSecret ||
      suppliedBuffer.length !== configuredBuffer.length ||
      !crypto.timingSafeEqual(suppliedBuffer, configuredBuffer)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Invalid bootstrap credentials',
      });
    }

    // 2. Validate the submitted details.
    const { error, value } = bootstrapSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    // 3. Hash the administrator's password before opening the transaction.
    const password = await bcrypt.hash(value.adminPassword, 12);

    let hospital;
    let admin;

    // 4. Create everything in one MongoDB transaction.
    await session.withTransaction(async () => {
      // Refuse setup if any hospital or user already exists.
      const existingHospital = await Hospital.exists({}).session(session);
      const existingUser = await User.exists({}).session(session);

      if (existingHospital || existingUser) {
        const setupError = new Error(
          'Initial setup has already been completed or existing records need migration.'
        );
        setupError.statusCode = 409;
        throw setupError;
      }

      // Create the hospital.
      const hospitals = await Hospital.create(
        [
          {
            name: value.hospitalName,
            code: value.hospitalCode,
          },
        ],
        { session }
      );

      hospital = hospitals[0];

      // Create the first hospital administrator.
      const administrators = await User.create(
        [
          {
            name: value.adminName,
            email: value.adminEmail,
            password,
            role: 'admin',
            hospital: hospital._id,
            staffId: 'ADM-000001',
          },
        ],
        { session }
      );

      admin = administrators[0];

      // The audit record must succeed or the entire transaction fails.
      await writeAuditLog(
        req,
        {
          action: 'hospital.initial_setup',
          resourceType: 'hospital',
          resourceId: hospital._id.toString(),
          hospitalId: hospital._id,
          actorId: admin._id,
          actorName: admin.name,
          actorRole: 'admin',
          metadata: {
            hospitalCode: hospital.code,
          },
        },
        { session }
      );
    });

    // 5. Return success only after the transaction commits.
    return res.status(201).json({
      success: true,
      message:
        'Hospital and initial administrator created. Remove or rotate the bootstrap secret immediately.',
      hospital: {
        id: hospital._id,
        name: hospital.name,
        code: hospital.code,
      },
      administrator: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        staffId: admin.staffId,
      },
    });
  } catch (error) {
    return next(error);
  } finally {
    await session.endSession();
  }
};

exports.createInvitation = async (req, res, next) => {
  try {
    const { error, value } = inviteSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });
    if (await User.exists({ email: value.email })) return res.status(409).json({ success: false, message: 'Email is already registered' });
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ success: false, message: 'Configure a transactional email provider before creating production invitations.' });
    }
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const invitation = await Invitation.create({ hospital: req.user.hospitalId, email: value.email, name: value.name, role: value.role, tokenHash, invitedBy: req.user.id, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
await writeAuditLog(req, {
  action: 'staff.invitation_created',
  resourceType: 'invitation',
  resourceId: invitation._id.toString(),
  metadata: {
    role: value.role,
  },
});
    // Development-only link response. Production must use an email provider.
    const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.status(201).json({ success: true, message: 'Development invitation created. This link is shown only outside production.', invitation: { id: invitation._id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt, developmentUrl: `${frontend.replace(/\/$/, '')}/accept-invitation?token=${rawToken}` } });
  } catch (error) { return next(error); }
};


exports.acceptInvitation = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    // 1. Validate the invitation token and password.
    const { error, value } = acceptSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    // 2. Hash the invitation token and password.
    const tokenHash = crypto
      .createHash('sha256')
      .update(value.token)
      .digest('hex');

    const password = await bcrypt.hash(value.password, 12);

    let createdUser;

    // 3. Perform account creation in one transaction.
    await session.withTransaction(async () => {
      // Atomically claim the invitation.
      // Only one request can successfully accept it.
      const invitation = await Invitation.findOneAndUpdate(
        {
          tokenHash,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        },
        {
          $set: { acceptedAt: new Date() },
        },
        {
          returnDocument: "after",
          session,
        }
      );

      if (!invitation) {
        const invitationError = new Error(
          'Invitation is invalid, expired, revoked or already used'
        );
        invitationError.statusCode = 400;
        throw invitationError;
      }

      // Prevent an email address from being registered twice.
      const existingUser = await User.exists({
        email: invitation.email,
      }).session(session);

      if (existingUser) {
        const emailError = new Error(
          'Email is already registered'
        );
        emailError.statusCode = 409;
        throw emailError;
      }

      // Get the correct staff ID prefix.
      const prefix = staffIdPrefix[invitation.role];

      if (!prefix) {
        throw new Error('Invalid staff role in invitation');
      }

      // Atomically increment this hospital's counter for this role.
      const sequence = await StaffSequence.findOneAndUpdate(
        {
          hospital: invitation.hospital,
          role: invitation.role,
        },
        {
          $inc: { sequence: 1 },
          $setOnInsert: {
            hospital: invitation.hospital,
            role: invitation.role,
          },
        },
        {
          returnDocument: "after",
          upsert: true,
          session,
          setDefaultsOnInsert: true,
        }
      );

      const staffId =
        `${prefix}-${String(sequence.sequence).padStart(6, '0')}`;

      // Create the staff account.
      const users = await User.create(
        [
          {
            name: invitation.name,
            email: invitation.email,
            password,
            role: invitation.role,
            hospital: invitation.hospital,
            staffId,
          },
        ],
        { session }
      );

      createdUser = users[0];

      // Record the successful invitation acceptance.
      // The audit record must also succeed for the transaction to commit.
      await writeAuditLog(
        req,
        {
          action: 'staff.invitation_accepted',
          resourceType: 'user',
          resourceId: createdUser._id.toString(),
          hospitalId: invitation.hospital,
          actorId: createdUser._id,
          actorName: createdUser.name,
          actorRole: createdUser.role,
          metadata: {
            role: createdUser.role,
            staffId,
          },
        },
        { session }
      );
    });

    // 4. Return success only after the transaction commits.
    return res.status(201).json({
      success: true,
      message: 'Staff account activated. Please log in.',
      user: {
        id: createdUser._id,
        name: createdUser.name,
        email: createdUser.email,
        role: createdUser.role,
        staffId: createdUser.staffId,
      },
    });
  } catch (error) {
    return next(error);
  } finally {
    await session.endSession();
  }
};

exports.revokeInvitation = async (req, res, next) => {
  try {
    const invitation = await Invitation.findOne({ _id: req.params.id, hospital: req.user.hospitalId, acceptedAt: null, revokedAt: null });
    if (!invitation) return res.status(404).json({ success: false, message: 'Pending invitation not found' });
    invitation.revokedAt = new Date();
    await invitation.save();
    await writeAuditLog(req, { action: 'staff.invitation_revoked', resourceType: 'invitation', resourceId: invitation._id.toString() });
    return res.json({ success: true, message: 'Invitation revoked' });
  } catch (error) { return next(error); }
};

exports.listAuditLogs = async (req, res, next) => {
  try {
    const AuditLog = require('../models/auditLog');
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
    const query = { hospital: req.user.hospitalId };
    if (req.query.action) query.action = req.query.action;
    if (req.query.actor) {
  if (!mongoose.isValidObjectId(req.query.actor)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid actor ID',
    });
  }

  query.actor = req.query.actor;
}
    const [data, total] = await Promise.all([AuditLog.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), AuditLog.countDocuments(query)]);
    return res.json({ success: true, page, limit, total, data });
  } catch (error) { return next(error); }
};
