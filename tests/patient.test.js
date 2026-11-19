
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const app = require("../app");
const User = require("../models/user");
const Hospital = require("../models/hospital");
const AuditLog = require("../models/auditLog");
const auditAction = require("../middleware/auditAction");
// Create a hospital and an authenticated user for each test.
const createAuthenticatedUser = async (role = "doctor") => {
  const hospital = await Hospital.create({
    name: "CarePulse Test Hospital",
    code: `TEST${new mongoose.Types.ObjectId().toString().slice(-6)}`,
    country: "Nigeria",
    status: "active",
  });

  const user = await User.create({
    name: `Test ${role}`,
    email: `${role}-${new mongoose.Types.ObjectId()}@example.com`,
    password: "TestPassword123!",
    role,
    hospital: hospital._id,
    staffId: `${role.toUpperCase()}-${new mongoose.Types.ObjectId().toString().slice(-6)}`,
    isActive: true,
    tokenVersion: 0,
  });

  // The authentication middleware checks the user ID and token version.
  const token = jwt.sign(
    {
      id: user._id.toString(),
      tokenVersion: user.tokenVersion,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  return {
    hospital,
    user,
    token,
  };
};

// Reusable valid patient information.
const validPatient = (overrides = {}) => ({
  firstName: "John",
  middleName: "David",
  lastName: "Doe",
  nin: "12345678901",
  dob: "1995-05-15",
  gender: "male",
  email: "john@example.com",
  phone: "08012345678",
  address: "12 Test Street, Lagos",
  stateOfOrigin: "Lagos",
  lgaOfOrigin: "Ikeja",
  bloodGroup: "O+",
  genotype: "AA",
  dateOfVisits: [new Date().toISOString()],
  diagnosis: "Malaria infection",
  treatment: "Antimalarial medication",
  notes: "Patient is responding to treatment.",
  vitals: [
    {
      bloodPressure: "120/80",
      weight: 70,
      height: 175,
      temperature: 36.5,
      pulse: 75,
      respiratoryRate: 18,
      oxygenSaturation: 98,
    },
  ],
  ...overrides,
});

// Patient responses may be wrapped differently by different endpoints.
// This helper extracts the patient object without depending on the wrapper.
const extractPatient = (body) => {
  return body?.data?.patient || body?.data || body?.patient || body;
};

describe("CarePulse Patient API", () => {
  let doctor;

  // Create a fresh doctor and hospital before each test.
  beforeEach(async () => {
    doctor = await createAuthenticatedUser("doctor");
  });

  describe("Authentication", () => {
    it("should reject requests without an authentication token", async () => {
      const response = await request(app).get("/api/v1/patients");

      expect(response.statusCode).toBe(401);
    });
  });

  describe("Patient creation", () => {
    it("should create a patient successfully", async () => {
      const response = await request(app)
        .post("/api/v1/patients")
        .set("Authorization", `Bearer ${doctor.token}`)
        .send(validPatient());

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);

      const patient = extractPatient(response.body);

      expect(patient.firstName).toBe("John");
      expect(patient.lastName).toBe("Doe");
      expect(patient.nin).toBe("12345678901");
      expect(patient.patientId).toBeDefined();
    });

    it("should record the created patient's ID in the audit log", async () => {
  const response = await request(app)
    .post("/api/v1/patients")
    .set("Authorization", `Bearer ${doctor.token}`)
    .send(validPatient());

  expect(response.statusCode).toBe(201);

  // Wait for the response-finish audit middleware to save its record.
  await auditAction.waitForAuditWrites();

  const patient = extractPatient(response.body);

  const auditLog = await AuditLog.findOne({
    action: "patient.created",
    resourceType: "patient",
    resourceId: patient._id.toString(),
  });

  expect(auditLog).not.toBeNull();
  expect(auditLog.actor.toString()).toBe(doctor.user._id.toString());
  expect(auditLog.actorName).toBe(doctor.user.name);
  expect(auditLog.outcome).toBe("success");
  expect(auditLog.createdAt).toBeInstanceOf(Date);
});

    it("should reject a patient with invalid NIN", async () => {
      const response = await request(app)
        .post("/api/v1/patients")
        .set("Authorization", `Bearer ${doctor.token}`)
        .send(validPatient({ nin: "12345" }));

      expect(response.statusCode).toBe(400);
    });

    it("should reject a patient with missing required fields", async () => {
      const response = await request(app)
        .post("/api/v1/patients")
        .set("Authorization", `Bearer ${doctor.token}`)
        .send({
          firstName: "John",
          lastName: "Doe",
        });

      expect(response.statusCode).toBe(400);
    });

    it("should reject duplicate NINs within the same hospital", async () => {
      const firstResponse = await request(app)
        .post("/api/v1/patients")
        .set("Authorization", `Bearer ${doctor.token}`)
        .send(validPatient());

      expect(firstResponse.statusCode).toBe(201);

      const secondResponse = await request(app)
        .post("/api/v1/patients")
        .set("Authorization", `Bearer ${doctor.token}`)
        .send(
          validPatient({
            firstName: "Jane",
            nin: "12345678901",
          })
        );

      expect(secondResponse.statusCode).toBe(409);
    });
  });

  describe("Patient listing and retrieval", () => {
    it("should return the patients belonging to the authenticated hospital", async () => {
      await request(app)
        .post("/api/v1/patients")
        .set("Authorization", `Bearer ${doctor.token}`)
        .send(validPatient());

      const response = await request(app)
        .get("/api/v1/patients")
        .set("Authorization", `Bearer ${doctor.token}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.total).toBe(1);
    });

    it("should return a single patient by ID", async () => {
      const createResponse = await request(app)
        .post("/api/v1/patients")
        .set("Authorization", `Bearer ${doctor.token}`)
        .send(validPatient());

      const patient = extractPatient(createResponse.body);

      const response = await request(app)
        .get(`/api/v1/patients/${patient._id}`)
        .set("Authorization", `Bearer ${doctor.token}`);

      expect(response.statusCode).toBe(200);

      const returnedPatient = extractPatient(response.body);
      expect(returnedPatient._id).toBe(patient._id);
    });

    it("should not allow a user from another hospital to view the patient", async () => {
      const createResponse = await request(app)
        .post("/api/v1/patients")
        .set("Authorization", `Bearer ${doctor.token}`)
        .send(validPatient());

      const patient = extractPatient(createResponse.body);

      // Create another hospital and a doctor who belongs to it.
      const anotherDoctor = await createAuthenticatedUser("doctor");

      const response = await request(app)
        .get(`/api/v1/patients/${patient._id}`)
        .set("Authorization", `Bearer ${anotherDoctor.token}`);

      // The patient exists, but does not belong to this doctor's hospital.
      expect(response.statusCode).toBe(404);
    });
  });

  describe("Patient updates and vital signs", () => {
    it("should update patient information", async () => {
      const createResponse = await request(app)
        .post("/api/v1/patients")
        .set("Authorization", `Bearer ${doctor.token}`)
        .send(validPatient());

      const patient = extractPatient(createResponse.body);

      const response = await request(app)
        .patch(`/api/v1/patients/${patient._id}`)
        .set("Authorization", `Bearer ${doctor.token}`)
        .send({
          diagnosis: "Typhoid fever",
          treatment: "Prescribed treatment",
        });

      expect(response.statusCode).toBe(200);

      const updatedPatient = extractPatient(response.body);
      expect(updatedPatient.diagnosis).toBe("Typhoid fever");
    });

    it("should append new vital readings instead of replacing the previous readings", async () => {
      const createResponse = await request(app)
        .post("/api/v1/patients")
        .set("Authorization", `Bearer ${doctor.token}`)
        .send(validPatient());

      const patient = extractPatient(createResponse.body);

      const response = await request(app)
        .patch(`/api/v1/patients/${patient._id}`)
        .set("Authorization", `Bearer ${doctor.token}`)
        .send({
          vitals: [
            {
              bloodPressure: "125/80",
              weight: 72,
              height: 175,
              temperature: 37,
              pulse: 80,
            },
          ],
        });

      expect(response.statusCode).toBe(200);

      const updatedPatient = extractPatient(response.body);

      expect(updatedPatient.vitals).toHaveLength(2);
      expect(updatedPatient.vitals[1].weight).toBe(72);
      expect(updatedPatient.vitals[0].weight).toBe(70);
    });
  });

  describe("Patient deletion", () => {
    it("should allow a doctor to delete a patient", async () => {
      const createResponse = await request(app)
        .post("/api/v1/patients")
        .set("Authorization", `Bearer ${doctor.token}`)
        .send(validPatient());

      const patient = extractPatient(createResponse.body);

      const response = await request(app)
        .delete(`/api/v1/patients/${patient._id}`)
        .set("Authorization", `Bearer ${doctor.token}`);

      expect(response.statusCode).toBe(200);
    });

    it("should reject an admin if the route only permits doctors and nurses", async () => {
      const createResponse = await request(app)
        .post("/api/v1/patients")
        .set("Authorization", `Bearer ${doctor.token}`)
        .send(validPatient());

      const patient = extractPatient(createResponse.body);

      const admin = await createAuthenticatedUser("admin");

      const response = await request(app)
        .delete(`/api/v1/patients/${patient._id}`)
        .set("Authorization", `Bearer ${admin.token}`);

      expect(response.statusCode).toBe(403);
    });
  });

  describe("Patient PDF export", () => {
    it("should export a patient's record as a PDF", async () => {
      const createResponse = await request(app)
        .post("/api/v1/patients")
        .set("Authorization", `Bearer ${doctor.token}`)
        .send(validPatient());

      const patient = extractPatient(createResponse.body);

      const response = await request(app)
        .get(`/api/v1/patients/${patient._id}/export`)
        .set("Authorization", `Bearer ${doctor.token}`);

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toMatch(/application\/pdf/);
    });
  });
});
