
const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const User = require("../models/user");
const Hospital = require("../models/hospital");
const AuditLog = require("../models/auditLog");

describe("Audit Logs API", () => {
  let hospitalA;
  let hospitalB;

  let admin;
  let doctor;
  let nurse;
  let anotherHospitalAdmin;

  const createUser = async (hospital, role, staffId) => {
    return User.create({
      name: `${role} ${staffId}`,
      email: `${staffId}@test.com`,
      password: "test-password-hash",
      role,
      hospital: hospital._id,
      staffId,
    });
  };

  const createToken = (user) => {
    return jwt.sign(
      {
        id: user._id.toString(),
        tokenVersion: user.tokenVersion,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
  };

  const authenticatedRequest = (user) => {
    return request(app)
      .get("/api/v1/onboarding/audit-logs")
      .set("Authorization", `Bearer ${createToken(user)}`);
  };

  const createAuditLog = async (hospital, actor, action, resourceType = "patient") => {
    return AuditLog.create({
      hospital: hospital._id,
      actor: actor._id,
      actorName: actor.name,
      actorRole: actor.role,
      action,
      resourceType,
      resourceId: "test-resource-001",
      outcome: "success",
      metadata: {},
    });
  };

  beforeEach(async () => {
    hospitalA = await Hospital.create({
      name: "Hospital A",
      code: "HOSP-A",
    });

    hospitalB = await Hospital.create({
      name: "Hospital B",
      code: "HOSP-B",
    });

    admin = await createUser(hospitalA, "admin", "ADM001");
    doctor = await createUser(hospitalA, "doctor", "DOC001");
    nurse = await createUser(hospitalA, "nurse", "NUR001");

    anotherHospitalAdmin = await createUser(
      hospitalB,
      "admin",
      "ADM002"
    );
  });

  describe("Authentication and authorization", () => {
    test("should reject requests without an authorization token", async () => {
      const response = await request(app)
        .get("/api/v1/onboarding/audit-logs");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test("should reject an invalid JWT", async () => {
      const response = await request(app)
        .get("/api/v1/onboarding/audit-logs")
        .set("Authorization", "Bearer invalid-token");

      expect(response.status).toBe(401);
    });

    test.each([
      ["admin", () => admin],
      ["doctor", () => doctor],
      ["nurse", () => nurse],
    ])("should allow an authenticated %s to view audit logs", async (role, getUser) => {
      const user = getUser();

      await createAuditLog(hospitalA, admin, "PATIENT_CREATED");

      const response = await authenticatedRequest(user);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    test("should reject a user whose account is inactive", async () => {
      admin.isActive = false;
      await admin.save();

      const response = await authenticatedRequest(admin);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test("should reject a token whose tokenVersion is outdated", async () => {
      const oldToken = createToken(admin);

      admin.tokenVersion += 1;
      await admin.save();

      const response = await request(app)
        .get("/api/v1/onboarding/audit-logs")
        .set("Authorization", `Bearer ${oldToken}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toContain("Session has been revoked");
    });
  });

  describe("Hospital data isolation", () => {
    test("should only return audit logs belonging to the user's hospital", async () => {
      await createAuditLog(hospitalA, admin, "PATIENT_CREATED");
      await createAuditLog(hospitalB, anotherHospitalAdmin, "PATIENT_DELETED");

      const response = await authenticatedRequest(admin);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].action).toBe("PATIENT_CREATED");

      expect(
        response.body.data.some(
          (log) => log.action === "PATIENT_DELETED"
        )
      ).toBe(false);
    });

    test("should return only Hospital B logs to Hospital B administrators", async () => {
      await createAuditLog(hospitalA, admin, "PATIENT_CREATED");
      await createAuditLog(hospitalB, anotherHospitalAdmin, "STAFF_CREATED");

      const response = await authenticatedRequest(anotherHospitalAdmin);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].action).toBe("STAFF_CREATED");
    });
  });

  describe("Filtering", () => {
    test("should filter audit logs by action", async () => {
      await createAuditLog(hospitalA, admin, "PATIENT_CREATED");
      await createAuditLog(hospitalA, doctor, "PATIENT_UPDATED");
      await createAuditLog(hospitalA, nurse, "PATIENT_DELETED");

      const response = await authenticatedRequest(admin)
        .query({ action: "PATIENT_UPDATED" });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].action).toBe("PATIENT_UPDATED");
    });

    test("should filter audit logs by actor ID", async () => {
      await createAuditLog(hospitalA, admin, "PATIENT_CREATED");
      await createAuditLog(hospitalA, doctor, "PATIENT_UPDATED");

      const response = await authenticatedRequest(admin)
        .query({ actor: doctor._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].actor.toString()).toBe(
        doctor._id.toString()
      );
    });

    test("should reject an invalid actor ID filter", async () => {
      const response = await authenticatedRequest(admin)
        .query({ actor: "not-a-valid-object-id" });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("Pagination", () => {
    test("should return the requested page and limit", async () => {
      for (let i = 1; i <= 5; i++) {
        await createAuditLog(
          hospitalA,
          admin,
          `TEST_ACTION_${i}`
        );
      }

      const response = await authenticatedRequest(admin)
        .query({ page: 2, limit: 2 });

      expect(response.status).toBe(200);
      expect(response.body.page).toBe(2);
      expect(response.body.limit).toBe(2);
      expect(response.body.total).toBe(5);
      expect(response.body.totalPages).toBe(3);
      expect(response.body.data).toHaveLength(2);
    });

    test("should cap the requested limit at 100", async () => {
      const response = await authenticatedRequest(admin)
        .query({ limit: 500 });

      expect(response.status).toBe(200);
      expect(response.body.limit).toBe(100);
    });
  });
});
