
const mongoose = require("mongoose");

const invitationSchema = new mongoose.Schema(
  {
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    role: {
      type: String,
      enum: ["doctor", "nurse"],
      required: true,
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },

    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    acceptedAt: {
      type: Date,
      default: null,
    },

    revokedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Automatically remove expired invitations.
invitationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

// Prevent duplicate model compilation.
module.exports =
  mongoose.models.Invitation ||
  mongoose.model("Invitation", invitationSchema);
