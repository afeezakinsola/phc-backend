// tests/setup.js

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

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
  mongoServer = await MongoMemoryServer.create();

  const mongoUri = mongoServer.getUri();

  await mongoose.connect(mongoUri);
}, 120000);

beforeEach(async () => {
  const collections = mongoose.connection.collections;

  for (const collection of Object.values(collections)) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
  }
}, 30000);