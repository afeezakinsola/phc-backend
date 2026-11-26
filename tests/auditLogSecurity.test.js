
const mongoose = require("mongoose");

const AuditLog = require("../models/auditLog");
const writeAuditLog = require("../utils/writeAuditLog");

describe("Audit Log Security", () => {
  let auditLog;

  const req = {
    user: {
      id: new mongoose.Types.ObjectId().toString(),
      name: "Test Admin",
      role: "admin",
      hospitalId: new mongoose.Types.ObjectId().toString(),
    },
    ip: "127.0.0.1",
    get: jest.fn().mockReturnValue("Jest Test Agent"),
  };

  beforeEach(async () => {
    auditLog = await AuditLog.create({
      action: "PATIENT_CREATED",
      resourceType: "patient",
      resourceId: "PAT-001",
      outcome: "success",
    });
  });

  describe("Append-only protection", () => {
    test("should prevent document-level updates using save()", async () => {
      auditLog.action = "PATIENT_DELETED";

      await expect(auditLog.save()).rejects.toThrow(
        "Audit logs are append-only."
      );

      const unchanged = await AuditLog.findById(auditLog._id);

      expect(unchanged.action).toBe("PATIENT_CREATED");
    });

    test.each([
      ["updateOne", () =>
        AuditLog.updateOne(
          { _id: auditLog._id },
          { $set: { action: "CHANGED" } }
        )],
      ["updateMany", () =>
        AuditLog.updateMany(
          {},
          { $set: { action: "CHANGED" } }
        )],
      ["findOneAndUpdate", () =>
        AuditLog.findOneAndUpdate(
          { _id: auditLog._id },
          { $set: { action: "CHANGED" } }
        )],
      ["findByIdAndUpdate", () =>
        AuditLog.findByIdAndUpdate(
          auditLog._id,
          { $set: { action: "CHANGED" } }
        )],
      ["replaceOne", () =>
        AuditLog.replaceOne(
          { _id: auditLog._id },
          { action: "REPLACED" }
        )],
    ])("should block %s", async (_operation, execute) => {
      await expect(execute()).rejects.toThrow(
        "Audit logs are append-only."
      );

      const unchanged = await AuditLog.findById(auditLog._id);
      expect(unchanged.action).toBe("PATIENT_CREATED");
    });

    test.each([
      ["deleteOne", () =>
        AuditLog.deleteOne({ _id: auditLog._id })],
      ["deleteMany", () =>
        AuditLog.deleteMany({ _id: auditLog._id })],
      ["findOneAndDelete", () =>
        AuditLog.findOneAndDelete({ _id: auditLog._id })],
      ["findByIdAndDelete", () =>
        AuditLog.findByIdAndDelete(auditLog._id)],
    ])("should block %s", async (_operation, execute) => {
      await expect(execute()).rejects.toThrow(
        "Audit logs cannot be deleted."
      );

      const existing = await AuditLog.findById(auditLog._id);
      expect(existing).not.toBeNull();
    });
  });

  describe("Metadata sanitization", () => {
    test("should save approved metadata and discard sensitive fields", async () => {
    

      await writeAuditLog(req, {
        action: "STAFF_UPDATED",
        resourceType: "staff",
        metadata: {
          hospitalCode: "HOSP001",
          role: "doctor",
          staffId: "STAFF001",
          changedFields: ["name", "role"],
          updatedFields: ["name"],

          password: "secret-password",
          token: "secret-jwt",
          email: "private@example.com",
          phone: "08000000000",
          nin: "12345678901",
          diagnosis: "Sensitive diagnosis",
          clinicalNotes: "Private clinical notes",
        },
      });

      const savedLog = await AuditLog.findOne({
        action: "STAFF_UPDATED",
      }).lean();

      expect(savedLog).not.toBeNull();

      expect(savedLog.metadata).toEqual({
        hospitalCode: "HOSP001",
        role: "doctor",
        staffId: "STAFF001",
        changedFields: ["name", "role"],
        updatedFields: ["name"],
      });

      expect(savedLog.metadata.password).toBeUndefined();
      expect(savedLog.metadata.token).toBeUndefined();
      expect(savedLog.metadata.email).toBeUndefined();
      expect(savedLog.metadata.diagnosis).toBeUndefined();
      expect(savedLog.metadata.clinicalNotes).toBeUndefined();
    });

    test("should limit approved metadata strings to 150 characters", async () => {

      await writeAuditLog(req, {
        action: "STAFF_UPDATED",
        metadata: {
          staffId: "A".repeat(200),
        },
      });

      const savedLog = await AuditLog.findOne({
        action: "STAFF_UPDATED",
      });

      expect(savedLog.metadata.staffId).toHaveLength(150);
    });

    test("should limit changed-field arrays to 30 strings of 100 characters", async () => {
     

      await writeAuditLog(req, {
        action: "STAFF_UPDATED",
        metadata: {
          changedFields: [
            ...Array(35).fill("A".repeat(150)),
            123,
            null,
          ],
        },
      });

      const savedLog = await AuditLog.findOne({
        action: "STAFF_UPDATED",
      });

      expect(savedLog.metadata.changedFields).toHaveLength(30);
      expect(savedLog.metadata.changedFields[0]).toHaveLength(100);
      expect(
        savedLog.metadata.changedFields.every(
          (field) => typeof field === "string"
        )
      ).toBe(true);
    });

    test.each([
      ["null", null],
      ["an array", ["password", "token"]],
      ["a string", "sensitive information"],
    ])("should safely handle metadata supplied as %s", async (_type, metadata) => {
      
      await writeAuditLog(req, {
        action: "TEST_ACTION",
        metadata,
      });

      const savedLog = await AuditLog.findOne({
        action: "TEST_ACTION",
      });

      expect(savedLog.metadata).toEqual({});
    });
  });

  describe("Audit write failure handling", () => {
    let createSpy;
    let consoleErrorSpy;
    let originalFailClosed;

    beforeEach(() => {
      originalFailClosed = process.env.AUDIT_FAIL_CLOSED;
      consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      createSpy = jest.spyOn(AuditLog, "create");
      createSpy.mockRejectedValue(new Error("Simulated database failure"));
    });

    afterEach(() => {
      createSpy.mockRestore();
      consoleErrorSpy.mockRestore();

      if (originalFailClosed === undefined) {
        delete process.env.AUDIT_FAIL_CLOSED;
      } else {
        process.env.AUDIT_FAIL_CLOSED = originalFailClosed;
      }
    });

    test("should not throw for non-transactional failures when fail-closed is disabled", async () => {
      delete process.env.AUDIT_FAIL_CLOSED;

      await expect(
        writeAuditLog(req, { action: "TEST_ACTION" })
      ).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    test("should throw for non-transactional failures when fail-closed is enabled", async () => {
      process.env.AUDIT_FAIL_CLOSED = "true";

      await expect(
        writeAuditLog(req, { action: "TEST_ACTION" })
      ).rejects.toThrow("Simulated database failure");
    });

    test("should throw for transactional audit write failures", async () => {
      delete process.env.AUDIT_FAIL_CLOSED;

      await expect(
        writeAuditLog(
          req,
          { action: "TEST_ACTION" },
          { session: {} }
        )
      ).rejects.toThrow("Simulated database failure");
    });
  });

  describe("Input validation", () => {
    test("should reject an empty audit action", async () => {
      await expect(
        writeAuditLog(req, { action: " " })
      ).rejects.toThrow("An audit action is required.");
    });

    test("should reject an invalid audit outcome", async () => {
      await expect(
        writeAuditLog(req, {
          action: "TEST_ACTION",
          outcome: "unknown",
        })
      ).rejects.toThrow("Invalid audit outcome.");
    });
  });
});
