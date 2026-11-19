
const mongoose = require("mongoose");

const staffSequenceSchema = new mongoose.Schema(
  {
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
    },

    role: {
      type: String,
      enum: ["admin", "doctor", "nurse"],
      required: true,
    },

    sequence: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

// Each hospital has one independent counter for each staff role.
staffSequenceSchema.index(
  { hospital: 1, role: 1 },
  { unique: true }
);

module.exports =
  mongoose.models.StaffSequence ||
  mongoose.model("StaffSequence", staffSequenceSchema);