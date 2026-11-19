
// Handle staff registration, login and staff account operations.

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/user");

const logger = require("../utils/logger");
const writeAuditLog = require("../utils/writeAuditLog");

const {
  registerSchema,
  loginSchema,
  updateUserSchema,
} = require("../validations/userValidation");

const isValidId = (id) => mongoose.isValidObjectId(id);

// Return only approved public user information.
// Never expose password hashes or internal authentication fields.
const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  staffId: user.staffId || null,
  hospitalId: user.hospital || null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

// STAFF REGISTRATION
exports.register = async (req, res, next) => {
  try {
    const input = {
      ...req.body,
      name:
        typeof req.body.name === "string"
          ? req.body.name.trim()
          : req.body.name,
      email:
        typeof req.body.email === "string"
          ? req.body.email.trim().toLowerCase()
          : req.body.email,
      role:
        typeof req.body.role === "string"
          ? req.body.role.trim().toLowerCase()
          : req.body.role,
    };

    const { error, value } = registerSchema.validate(input);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { name, email, password, role } = value;

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
    });

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      }
    );

    logger.info(`New ${role} registered: ${email}`);

    return res.status(201).json({
      success: true,
      message: "Registration successful.",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    return next(error);
  }
};

// STAFF LOGIN
exports.login = async (req, res, next) => {
  try {
    const input = {
      ...req.body,
      email:
        typeof req.body.email === "string"
          ? req.body.email.trim().toLowerCase()
          : req.body.email,
    };

    const { error, value } = loginSchema.validate(input);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { email, password } = value;

    const user = await User.findOne({ email }).select("+password");

    // Invalid email or password.
// Invalid email or password.
if (!user || !(await bcrypt.compare(password, user.password))) {
  await writeAuditLog(req, {
    action: "auth.login_failed",
    resourceType: "user",

    // Identifies the account that was targeted, if it exists.
    resourceId: user?._id?.toString() || null,

    hospitalId: user?.hospital || null,

    // Do not set actorId, actorName or actorRole here.
    // The person has not successfully authenticated.
    outcome: "failure",

    // These details identify the account being targeted,
    // not the person attempting to log in.
    metadata: user
      ? {
          targetAccountName: user.name,
          targetAccountRole: user.role,
          targetStaffId: user.staffId,
        }
      : {},
  });

  return res.status(401).json({
    success: false,
    message: "Invalid credentials",
  });
}

    // Prevent inactive staff from logging in.
    if (!user.isActive) {
      await writeAuditLog(req, {
        action: "auth.login_blocked_inactive",
        resourceType: "user",
        resourceId: user._id.toString(),
        hospitalId: user.hospital,
        outcome: "failure",
      });

      return res.status(403).json({
        success: false,
        message:
          "Account is inactive. Contact your hospital administrator.",
      });
    }

    // Record successful login.
    await writeAuditLog(req, {
      action: "auth.login_success",
      resourceType: "user",
      resourceId: user._id.toString(),
      actorId: user._id,
      actorName: user.name,
      actorRole: user.role,
      hospitalId: user.hospital,
    });

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        tokenVersion: user.tokenVersion || 0,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "8h",
      }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    return next(error);
  }
};

// GET ALL STAFF IN THE CURRENT HOSPITAL
exports.getUsers = async (req, res, next) => {
  try {
    const page = Math.max(
      Number.parseInt(req.query.page, 10) || 1,
      1
    );

    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 10, 1),
      100
    );

    // Always restrict results to the logged-in user's hospital.
    const query = {
      hospital: req.user.hospitalId,
    };

    // Search by name, email or staff ID.
    if (req.query.search) {
      const search = req.query.search.trim();

      if (search.length > 100) {
        return res.status(400).json({
          success: false,
          message: "Search term is too long.",
        });
      }

      // Escape special regex characters in the search term.
      const escapedSearch = search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      query.$or = [
        { name: { $regex: escapedSearch, $options: "i" } },
        { email: { $regex: escapedSearch, $options: "i" } },
        { staffId: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    // Filter by role.
    if (req.query.role) {
      const role = req.query.role.toLowerCase();

      if (!["admin", "doctor", "nurse"].includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid staff role filter.",
        });
      }

      query.role = role;
    }

    // Filter by account status.
    if (req.query.status) {
      const status = req.query.status.toLowerCase();

      if (!["active", "inactive"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be active or inactive.",
        });
      }

      query.isActive = status === "active";
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      User.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    // Use publicUser so staffId is consistently included.
    const staff = users.map((user) => publicUser(user));

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      pages: totalPages,
      totalPages,
      data: staff,
    });
  } catch (error) {
    return next(error);
  }
};

// GET ONE STAFF PROFILE
exports.getUserById = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID",
      });
    }

    const user = await User.findOne({
      _id: req.params.id,
      hospital: req.user.hospitalId,
    }).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: publicUser(user),
    });
  } catch (error) {
    return next(error);
  }
};

// UPDATE STAFF DETAILS
// The route should restrict this operation to authorised users.
exports.updateUser = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID",
      });
    }

    const input = {
      ...req.body,
      name:
        typeof req.body.name === "string"
          ? req.body.name.trim()
          : req.body.name,
      email:
        typeof req.body.email === "string"
          ? req.body.email.trim().toLowerCase()
          : req.body.email,
      role:
        typeof req.body.role === "string"
          ? req.body.role.trim().toLowerCase()
          : req.body.role,
    };

    const { error, value } = updateUserSchema.validate(input);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const user = await User.findOne({
      _id: req.params.id,
      hospital: req.user.hospitalId,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check whether the new email is already in use.
    if (value.email && value.email !== user.email) {
      const emailInUse = await User.findOne({
        email: value.email,
        hospital: req.user.hospitalId,
        _id: { $ne: user._id },
      });

      if (emailInUse) {
        return res.status(409).json({
          success: false,
          message: "Email is already registered.",
        });
      }
    }

    // Prevent changing the final doctor account into a nurse account.
    if (user.role === "doctor" && value.role === "nurse") {
      const doctorCount = await User.countDocuments({
        role: "doctor",
        hospital: req.user.hospitalId,
      });

      if (doctorCount <= 1) {
        return res.status(409).json({
          success: false,
          message:
            "The last doctor account cannot be changed to a nurse.",
        });
      }
    }

    if (value.name !== undefined) {
      user.name = value.name;
    }

    if (value.email !== undefined) {
      user.email = value.email;
    }

    if (value.role !== undefined) {
      user.role = value.role;
    }

    await user.save();

    await writeAuditLog(req, {
      action: "staff.profile_updated",
      resourceType: "user",
      resourceId: user._id.toString(),
      metadata: {
        changedFields: Object.keys(value),
      },
    });

    logger.info(`Staff profile updated: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: publicUser(user),
    });
  } catch (error) {
    return next(error);
  }
};

// DEACTIVATE STAFF ACCOUNT
exports.deleteUser = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID",
      });
    }

    // Prevent users from deactivating their own accounts.
    if (req.user.id === req.params.id) {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate your own account.",
      });
    }

    const user = await User.findOne({
      _id: req.params.id,
      hospital: req.user.hospitalId,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found.",
      });
    }

    // Prevent deactivating the final active doctor.
    if (user.role === "doctor" && user.isActive) {
      const activeDoctorCount = await User.countDocuments({
        role: "doctor",
        hospital: req.user.hospitalId,
        isActive: true,
      });

      if (activeDoctorCount <= 1) {
        return res.status(409).json({
          success: false,
          message:
            "The last active doctor account cannot be deactivated.",
        });
      }
    }

    if (!user.isActive) {
      return res.status(409).json({
        success: false,
        message: "This staff account is already inactive.",
      });
    }

    // Deactivate account and invalidate existing JWT sessions.
    user.isActive = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1;

    await user.save();

    await writeAuditLog(req, {
      action: "staff.account_deactivated",
      resourceType: "user",
      resourceId: user._id.toString(),
      metadata: {
        role: user.role,
        staffId: user.staffId,
      },
    });

    logger.warn(`Staff account deactivated: ${user.staffId}`);

    return res.status(200).json({
      success: true,
      message: "Staff account deactivated successfully.",
    });
  } catch (error) {
    return next(error);
  }
};

// REACTIVATE STAFF ACCOUNT
exports.reactivateUser = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID",
      });
    }

    const user = await User.findOne({
      _id: req.params.id,
      hospital: req.user.hospitalId,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found.",
      });
    }

    if (user.isActive) {
      return res.status(409).json({
        success: false,
        message: "This staff account is already active.",
      });
    }

    user.isActive = true;

    await user.save();

    await writeAuditLog(req, {
      action: "staff.account_reactivated",
      resourceType: "user",
      resourceId: user._id.toString(),
      metadata: {
        role: user.role,
        staffId: user.staffId,
      },
    });

    logger.info(`Staff account reactivated: ${user.staffId}`);

    return res.status(200).json({
      success: true,
      message: "Staff account reactivated successfully.",
    });
  } catch (error) {
    return next(error);
  }
};

// LOGOUT
exports.logout = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (user) {
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      await user.save();
    }

    await writeAuditLog(req, {
      action: "auth.logout",
      resourceType: "user",
      resourceId: req.user.id,
    });

    return res.json({
      success: true,
      message: "Logged out successfully. This session has been revoked.",
    });
  } catch (error) {
    return next(error);
  }
};