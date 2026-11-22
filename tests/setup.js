
// tests/setup.js

const auditAction = require("../middleware/auditAction");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");


// Give database operations and test setup enough time to complete.
jest.setTimeout(30000);
// Mock Redis so tests don't need a real Redis connection.
jest.mock("../config/redis", () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue("OK"),
  keys: jest.fn().mockResolvedValue([]),
  del: jest.fn().mockResolvedValue(0),
}));

// Disable rate limiting during automated tests.
jest.mock("../middleware/rateLimiter", () => {
  return (req, res, next) => next();
});

let mongoServer;

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "carepulse_test_secret_key_123456789";

beforeAll(async () => {
  // Give MongoDB Memory Server up to 60 seconds to start.
  mongoServer = await MongoMemoryServer.create({
    instance: {
      launchTimeout: 60000,
    },
  });

  const mongoUri = mongoServer.getUri();

  await mongoose.connect(mongoUri);
}, 120000);

beforeEach(async () => {
  // Clear collections before each test.
  const collections = mongoose.connection.collections;

  for (const collection of Object.values(collections)) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  // Allow outstanding audit-log writes to finish first.
  await auditAction.waitForAuditWrites();

  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
  }
}, 30000);
