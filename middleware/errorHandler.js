
const logger = require("../utils/logger");

/**
 * Global Error Handling Middleware
 */
const errorHandler = (err, req, res, next) => {
  logger.error("REQUEST_ERROR", {
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.originalUrl,
  });

  const statusCode = err.statusCode || 500;

  const message =
    statusCode >= 500
      ? "Internal Server Error"
      : err.message || "Request failed";

  res.status(statusCode).json({
    success: false,
    status: statusCode >= 500 ? "error" : "fail",
    message,
  });
};

module.exports = errorHandler;
