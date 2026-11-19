
const mongoose = require("mongoose");

const patientSequenceSchema = new mongoose.Schema(
  {
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
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

// Each hospital has its own patient ID counter.
patientSequenceSchema.index(
  { hospital: 1 },
  { unique: true }
);

module.exports =
  mongoose.models.PatientSequence ||
  mongoose.model("PatientSequence", patientSequenceSchema);