const request = require("supertest");
const app = require("../app");

describe("API Health Check", () => {
  it("should return a successful response from the root endpoint", async () => {
    const response = await request(app).get("/");

    expect(response.statusCode).toBe(200);
    expect(response.text).toBe("PHC API is running...");
  });
});