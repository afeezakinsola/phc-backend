
const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      default: null,
      index: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    actorName: {
      type: String,
      default: "Unauthenticated",
    },
    actorRole: {
      type: String,
      default: "unknown",
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      default: "system",
    },
    resourceId: {
      type: String,
      default: null,
    },
    outcome: {
      type: String,
      enum: ["success", "failure"],
      default: "success",
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  }
);

// Allow new audit records, but prevent changes to existing documents.
auditLogSchema.pre("save", function () {
  if (!this.isNew) {
    throw new Error("Audit logs are append-only.");
  }
});

// Prevent common Mongoose query operations from modifying audit records.
const preventAuditModification = function () {
  throw new Error("Audit logs are append-only.");
};


const preventAuditDeletion = function () {
  throw new Error("Audit logs cannot be deleted.");
};

auditLogSchema.pre("findOneAndUpdate", preventAuditModification);
auditLogSchema.pre("updateOne", preventAuditModification);
auditLogSchema.pre("updateMany", preventAuditModification);
auditLogSchema.pre("replaceOne", preventAuditModification);

auditLogSchema.pre("deleteOne", preventAuditDeletion);
auditLogSchema.pre("deleteMany", preventAuditDeletion);
auditLogSchema.pre("findOneAndDelete", preventAuditDeletion);

module.exports =
  mongoose.models.AuditLog ||
  mongoose.model("AuditLog", auditLogSchema);
