
const request = require("supertest");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = require("../app");
const User = require("../models/user");
const Hospital = require("../models/hospital");
const AuditLog = require("../models/auditLog");
const auditAction = require("../middleware/auditAction");

const TEST_PASSWORD = "StrongPassword123!";

let hospital;
let admin;
let doctor;
let userCounter = 0;

// Create a hospital for the tests.
const createHospital = async () => {
  return Hospital.create({
    name: "Test Hospital",
    code: "TEST-HOSPITAL",
    country: "Nigeria",
  });
};

// Create a staff account with a hashed password.
const createUser = async (hospitalDoc, role = "doctor", options = {}) => {
  userCounter += 1;

  const password = options.password || TEST_PASSWORD;
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name: options.name || `Test ${role} ${userCounter}`,
    email: options.email || `${role}${userCounter}@example.com`,
    password: hashedPassword,
    role,
    hospital: hospitalDoc._id,
    staffId: options.staffId || `STAFF-${userCounter}`,
    isActive: options.isActive !== undefined ? options.isActive : true,
    tokenVersion: options.tokenVersion || 0,
  });

  return { user, password };
};

// Generate a JWT for an existing user.
const createToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
};

beforeEach(async () => {
  userCounter = 0;

  hospital = await createHospital();

  admin = await createUser(hospital, "admin", {
    name: "Hospital Admin",
    email: "admin@example.com",
    staffId: "ADMIN-001",
  });

  doctor = await createUser(hospital, "doctor", {
    name: "Test Doctor",
    email: "doctor@example.com",
    staffId: "DOCTOR-001",
  });
});

describe("Authentication", () => {
  it("should log in with correct credentials", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: doctor.user.email,
        password: doctor.password,
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.email).toBe(doctor.user.email);
    expect(response.body.user.password).toBeUndefined();
  });

  it("should trim and normalize the email during login", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "  DOCTOR@EXAMPLE.COM  ",
        password: doctor.password,
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.token).toBeDefined();
  });

  it("should reject an incorrect password and audit the attempt without impersonating the target account", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: doctor.user.email,
        password: "WrongPassword123!",
      });

    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);

    // Wait for pending audit middleware writes to finish.
    await auditAction.waitForAuditWrites();

    const auditLog = await AuditLog.findOne({
      action: "auth.login_failed",
      resourceId: doctor.user._id.toString(),
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog.resourceType).toBe("user");
    expect(auditLog.outcome).toBe("failure");

    // The targeted account must not be recorded as the person
    // who attempted the login.
    expect(auditLog.actor).toBeNull();
    expect(auditLog.actorName).toBe("Unauthenticated");
    expect(auditLog.actorRole).toBe("unknown");

    // The targeted account details should be retained as metadata.
    expect(auditLog.metadata.targetAccountName).toBe(doctor.user.name);
    expect(auditLog.metadata.targetAccountRole).toBe("doctor");
    expect(auditLog.metadata.targetStaffId).toBe(doctor.user.staffId);

    expect(auditLog.createdAt).toBeInstanceOf(Date);
  });

  it("should reject an email that does not exist", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "unknown@example.com",
        password: TEST_PASSWORD,
      });

    expect(response.statusCode).toBe(401);
  });

  it("should reject login when email and password are missing", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({});

    expect(response.statusCode).toBe(400);
  });

  it("should reject an invalid email address", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "not-an-email",
        password: TEST_PASSWORD,
      });

    expect(response.statusCode).toBe(400);
  });

  it("should prevent an inactive user from logging in", async () => {
    const inactive = await createUser(hospital, "nurse", {
      email: "inactive@example.com",
      isActive: false,
    });

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: inactive.user.email,
        password: inactive.password,
      });

    expect(response.statusCode).toBe(403);
    expect(response.body.message).toMatch(/Account is inactive/i);
  });
});

describe("JWT and session security", () => {
  it("should reject a request without an authentication token", async () => {
    const response = await request(app).get("/api/v1/auth/users");

    expect(response.statusCode).toBe(401);
  });

  it("should allow an admin to list hospital staff", async () => {
    const token = createToken(admin.user);

    const response = await request(app)
      .get("/api/v1/auth/users")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
  });

  it("should reject a token with an invalid signature", async () => {
    const response = await request(app)
      .get("/api/v1/auth/users")
      .set("Authorization", "Bearer invalid.token.signature");

    expect(response.statusCode).toBe(401);
  });

  it("should reject an expired token", async () => {
    const token = jwt.sign(
      {
        id: doctor.user._id,
        role: doctor.user.role,
        tokenVersion: doctor.user.tokenVersion,
      },
      process.env.JWT_SECRET,
      { expiresIn: "-1s" }
    );

    const response = await request(app)
      .get("/api/v1/patients")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(401);
  });

  it("should reject a token after its token version has been changed", async () => {
    const token = createToken(doctor.user);

    await User.findByIdAndUpdate(doctor.user._id, {
      $inc: { tokenVersion: 1 },
    });

    const response = await request(app)
      .get("/api/v1/patients")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(401);
  });

  it("should reject a token belonging to a deleted user", async () => {
    const token = createToken(doctor.user);

    await User.findByIdAndDelete(doctor.user._id);

    const response = await request(app)
      .get("/api/v1/patients")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(401);
  });

  it("should reject a token belonging to an inactive user", async () => {
    const token = createToken(doctor.user);

    await User.findByIdAndUpdate(doctor.user._id, {
      isActive: false,
    });

    const response = await request(app)
      .get("/api/v1/patients")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(401);
  });

  it("should invalidate the existing token after logout", async () => {
    const token = createToken(doctor.user);

    const logoutResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(logoutResponse.statusCode).toBe(200);

    const protectedResponse = await request(app)
      .get("/api/v1/patients")
      .set("Authorization", `Bearer ${token}`);

    expect(protectedResponse.statusCode).toBe(401);
  });
});

describe("Staff access permissions", () => {
  it("should prevent a doctor from listing all staff", async () => {
    const token = createToken(doctor.user);

    const response = await request(app)
      .get("/api/v1/auth/users")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(403);
  });

  it("should prevent public staff registration", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Public User",
        email: "public@example.com",
        password: TEST_PASSWORD,
        role: "doctor",
      });

    expect(response.statusCode).toBe(403);
    expect(response.body.message).toMatch(/Public registration is disabled/i);
  });

  it("should not allow a staff profile update to change a password", async () => {
    const token = createToken(admin.user);

    const response = await request(app)
      .patch(`/api/v1/auth/users/${doctor.user._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        password: "NewPassword123!",
      });

    expect(response.statusCode).toBe(400);
  });

  it("should apply a role change to an existing token immediately", async () => {
    // Keep another active doctor in the hospital.
    // This prevents the final-doctor protection from blocking the update.
    await createUser(hospital, "doctor");

    const doctorToken = createToken(doctor.user);
    const adminToken = createToken(admin.user);

    const updateResponse = await request(app)
      .patch(`/api/v1/auth/users/${doctor.user._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        role: "nurse",
      });

    expect(updateResponse.statusCode).toBe(200);

    // The existing token should now use the user's updated role.
    const protectedResponse = await request(app)
      .get("/api/v1/auth/users")
      .set("Authorization", `Bearer ${doctorToken}`);

    expect(protectedResponse.statusCode).toBe(403);
  });
});

describe("Staff account management", () => {
  it("should deactivate a staff account and revoke its existing token", async () => {
    // Keep another active doctor in the hospital.
    // This prevents the final-doctor protection from blocking deactivation.
    await createUser(hospital, "doctor");

    const doctorToken = createToken(doctor.user);
    const adminToken = createToken(admin.user);

    const response = await request(app)
      .delete(`/api/v1/auth/users/${doctor.user._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.statusCode).toBe(200);

    // The deactivated user's previous token must no longer work.
    const protectedResponse = await request(app)
      .get("/api/v1/patients")
      .set("Authorization", `Bearer ${doctorToken}`);

    expect(protectedResponse.statusCode).toBe(401);
    expect(protectedResponse.body.message).toMatch(/Session has been revoked/i);
  });

  it("should reactivate an inactive staff account", async () => {
    const inactive = await createUser(hospital, "nurse", {
      email: "inactive-nurse@example.com",
      isActive: false,
    });

    const adminToken = createToken(admin.user);

    const response = await request(app)
      .patch(`/api/v1/auth/users/${inactive.user._id}/reactivate`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.statusCode).toBe(200);

    const updatedUser = await User.findById(inactive.user._id);

    expect(updatedUser.isActive).toBe(true);
  });
});
