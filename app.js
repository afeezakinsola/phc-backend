require("dotenv").config();
const express = require("express");
const authRoutes = require("./routes/authRoute");
const patientRoutes = require("./routes/patientRoute");
const onboardingRoutes = require("./routes/onboardingRoute");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const cors = require("cors");
const helmet = require("helmet");
const hospitalRoutes = require("./routes/hospitalRoute");
const hpp = require("hpp");
const dashboardRoutes = require("./routes/dashboardRoute");
const limiter = require("./middleware/rateLimiter");
const morgan = require("morgan");
const logger = require("./utils/logger");
const errorHandler = require("./middleware/errorHandler");
const metricsClient = require("./config/metrics");

const app = express();

//Middleware

// Allow local development and the deployed frontend origin(s).
// Set FRONTEND_URL on Render to the exact deployed frontend origin. Multiple
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  ...(process.env.FRONTEND_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
];

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header (for example, server-to-server or
      // command-line requests) are not browser CORS requests.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      const corsError = new Error("Origin is not allowed by CORS");
      corsError.statusCode = 403;
      return callback(corsError);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    optionsSuccessStatus: 204,
  }),
);
app.use(express.json());
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", metricsClient.register.contentType);

  res.end(await metricsClient.register.metrics());
});
app.use(hpp());
app.use(morgan("dev"));
app.use(limiter);
app.use(helmet());
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/onboarding", onboardingRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/patients", patientRoutes);
app.use("/api/v1/hospital", hospitalRoutes);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

//routes
app.get("/", (req, res) => {
  res.send("PHC API is running...");
});

app.use(errorHandler);

module.exports = app;
