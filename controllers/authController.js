/*
// handle registration and login
const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const {
  registerSchema,
  loginSchema,
} = require("../validations/userValidation");

exports.register = async (req, res) => {
  try {
    // Normalize input
    if (req.body.email) {
      req.body.email = req.body.email.trim().toLowerCase();
    }

    if (req.body.role) {
      req.body.role = req.body.role.trim().toLowerCase();
    }

    if (req.body.name) {
      req.body.name = req.body.name.trim();
    }

    // Validate input
    const { error } = registerSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { name, email, password, role } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered.",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
    });

    // Generate token
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      },
    );

    logger.info(`New ${role} registered: ${email}`);

    res.status(201).json({
      success: true,
      message: "Registration successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};
exports.login = async (req, res) => {
  try {
    if (req.body.email) {
      req.body.email = req.body.email.trim().toLowerCase();
    }
    const { error } = loginSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: "Invalid credentials" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid credentials" });
    }

    // Generate token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    // ✅ Send structured response
    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find().select("-password");

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.json({ msg: "User deleted successfully" });
  } catch (error) {
    next(error);
  }
};
*/

// Handle staff registration, login and staff account operations.
const mongoose = require("mongoose");
const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const {
  registerSchema,
  loginSchema,
  updateUserSchema,
} = require("../validations/userValidation");

const isValidId = (id) => mongoose.isValidObjectId(id);

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

exports.register = async (req, res, next) => {
  try {
    const input = {
      ...req.body,
      name: typeof req.body.name === "string" ? req.body.name.trim() : req.body.name,
      email: typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : req.body.email,
      role: typeof req.body.role === "string" ? req.body.role.trim().toLowerCase() : req.body.role,
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
    const user = await User.create({ name, email, password: hashedPassword, role });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
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

exports.login = async (req, res, next) => {
  try {
    const input = {
      ...req.body,
      email: typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : req.body.email,
    };
    const { error, value } = loginSchema.validate(input);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { email, password } = value;
    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ msg: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
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

exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find().select("-password").sort({ name: 1 });

    return res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    return next(error);
  }
};

// Retrieve one staff profile. Password hashes are never selected or returned.
exports.getUserById = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID",
      });
    }

    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    return next(error);
  }
};

// Update staff details. The route restricts this operation to doctors.
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
      name: typeof req.body.name === "string" ? req.body.name.trim() : req.body.name,
      email: typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : req.body.email,
      role: typeof req.body.role === "string" ? req.body.role.trim().toLowerCase() : req.body.role,
    };
    const { error, value } = updateUserSchema.validate(input);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (value.email && value.email !== user.email) {
      const emailInUse = await User.findOne({
        email: value.email,
        _id: { $ne: user._id },
      });

      if (emailInUse) {
        return res.status(409).json({
          success: false,
          message: "Email is already registered.",
        });
      }
    }

    // Prevent removing the final doctor account through a role change.
    if (user.role === "doctor" && value.role === "nurse") {
      const doctorCount = await User.countDocuments({ role: "doctor" });
      if (doctorCount <= 1) {
        return res.status(409).json({
          success: false,
          message: "The last doctor account cannot be changed to a nurse.",
        });
      }
    }

    if (value.name !== undefined) user.name = value.name;
    if (value.email !== undefined) user.email = value.email;
    if (value.role !== undefined) user.role = value.role;

    await user.save();
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

exports.deleteUser = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID",
      });
    }

    // Prevent a doctor from accidentally deleting the account currently in use.
    if (req.user.id === req.params.id) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account while signed in.",
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.role === "doctor") {
      const doctorCount = await User.countDocuments({ role: "doctor" });
      if (doctorCount <= 1) {
        return res.status(409).json({
          success: false,
          message: "The last doctor account cannot be deleted.",
        });
      }
    }

    await User.findByIdAndDelete(req.params.id);
    logger.warn(`Staff account deleted: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
