
const mongoose = require("mongoose");

const hospitalSchema = new mongoose.Schema(
  {
    // Hospital identity
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    // Hospital contact information
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 150,
    },

    phone: {
      type: String,
      trim: true,
      maxlength: 30,
    },

    // Hospital address
    address: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    city: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    state: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    country: {
      type: String,
      trim: true,
      default: "Nigeria",
      maxlength: 100,
    },

    // Hospital account status
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
  },
  { timestamps: true }
);

// Prevent OverwriteModelError during development.
module.exports =
  mongoose.models.Hospital ||
  mongoose.model("Hospital", hospitalSchema);