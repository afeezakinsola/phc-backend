
require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const connectDB = require("../config/db");
const Hospital = require("../models/hospital");
const User = require("../models/user");
const StaffSequence = require("../models/staffSequence");

const createTestAdmin = async () => {
  try {
    // Connect using the existing database configuration.
    await connectDB();

    // Safety check: never allow this script to run against production.
    if (mongoose.connection.name !== "carepulse_phase1_test") {
      throw new Error(
        `Wrong database: ${mongoose.connection.name}. Expected carepulse_phase1_test.`
      );
    }

    const name = process.env.ADMIN_NAME?.trim();
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    if (!name || !email || !password) {
      throw new Error("ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD are required.");
    }

    if (password.length < 12) {
      throw new Error("Use a password of at least 12 characters.");
    }

    // Find the existing test hospital.
    const hospital = await Hospital.findOne({ code: "UNITY-001" });

    if (!hospital) {
      throw new Error("Test hospital UNITY-001 was not found.");
    }

    if (hospital.status !== "active") {
      throw new Error("The test hospital is not active.");
    }

    // Do not create a replacement if users still exist in this hospital.
    const existingUsers = await User.countDocuments({
      hospital: hospital._id,
    });

    if (existingUsers > 0) {
      throw new Error(
        `Found ${existingUsers} existing user(s) in UNITY-001. No admin was created.`
      );
    }

    // Ensure the new email is not already used elsewhere.
    const emailExists = await User.findOne({ email });

    if (emailExists) {
      throw new Error("That email address is already in use.");
    }

    // Increment the existing admin sequence; do not reset it.
    const sequence = await StaffSequence.findOneAndUpdate(
      { hospital: hospital._id, role: "admin" },
      {
        $inc: { sequence: 1 },
        $setOnInsert: {
          hospital: hospital._id,
          role: "admin",
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    const staffId = `ADM-${String(sequence.sequence).padStart(6, "0")}`;

    // Hash the password because the User model has no automatic hash hook.
    const hashedPassword = await bcrypt.hash(password, 12);

    const admin = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "admin",
      hospital: hospital._id,
      staffId,
      isActive: true,
      tokenVersion: 0,
    });

    console.log("\nTest admin created successfully.");
    console.log("Hospital:", hospital.name);
    console.log("Staff ID:", admin.staffId);
    console.log("Email:", admin.email);
    console.log("Role:", admin.role);
    console.log("Password: not displayed");
  } catch (error) {
    console.error("Admin creation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

createTestAdmin();
