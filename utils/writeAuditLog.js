
const AuditLog = require("../models/auditLog");

// Only these metadata fields are permitted.
// Never store passwords, tokens, emails, NINs, phone numbers,
// diagnoses, clinical notes or other personal/clinical details here.
const ALLOWED_METADATA_FIELDS = new Set([
  "hospitalCode",
  "role",
  "staffId",
  "changedFields",
  "updatedFields",

  // Safe details about the account targeted by a failed login.
  "targetAccountName",
  "targetAccountRole",
  "targetStaffId",
]);

const sanitizeMetadata = (metadata = {}) => {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return {};
  }

  const safeMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (!ALLOWED_METADATA_FIELDS.has(key)) {
      continue;
    }

    // Permit simple strings for approved fields.
    if (typeof value === "string") {
      safeMetadata[key] = value.slice(0, 150);
      continue;
    }

    // Permit arrays of field names, such as changedFields.
    if (
      Array.isArray(value) &&
      ["changedFields", "updatedFields"].includes(key)
    ) {
      safeMetadata[key] = value
        .filter((item) => typeof item === "string")
        .map((item) => item.slice(0, 100))
        .slice(0, 30);
    }
  }

  return safeMetadata;
};

module.exports = async function writeAuditLog(req, event, options = {}) {
  if (!event || typeof event.action !== "string" || !event.action.trim()) {
    throw new Error("An audit action is required.");
  }

  const outcome = event.outcome || "success";

  if (!["success", "failure"].includes(outcome)) {
    throw new Error("Invalid audit outcome.");
  }

  try {
    await AuditLog.create(
      [
        {
          actor: event.actorId || req.user?.id || null,
          actorName: event.actorName || req.user?.name || "Unauthenticated",
          actorRole: event.actorRole || req.user?.role || "unknown",
          hospital: event.hospitalId || req.user?.hospitalId || null,
          action: event.action.trim(),
          resourceType: event.resourceType || "system",
          resourceId: event.resourceId || null,
          outcome,
          ipAddress: req.ip || null,
          userAgent: req.get("user-agent") || null,
          metadata: sanitizeMetadata(event.metadata),
        },
      ],
      options.session ? { session: options.session } : {}
    );
  } catch (error) {
    console.error("AUDIT_LOG_WRITE_FAILED:", error.message);

    // Transactional audit writes must succeed or the transaction rolls back.
    // AUDIT_FAIL_CLOSED=true also makes non-transactional writes throw errors.
    if (
      options.session ||
      process.env.AUDIT_FAIL_CLOSED === "true"
    ) {
      throw error;
    }
  }
};