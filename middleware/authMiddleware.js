const jwt = require("jsonwebtoken");
const User = require("../models/user");

/**
 * Authenticate the bearer token and load the current user from MongoDB.
 * Loading the user on each protected request means deleted accounts and
 * changed roles take effect immediately instead of waiting for JWT expiry.
 */
module.exports = async (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "Authorization token is required",
    });
  }

  // Keep compatibility with clients that send a raw token, while preferring
  // the standard Authorization: Bearer <token> format.
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : authHeader.trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authorization token is required",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    const user = await User.findById(userId).select("_id name email role hospital staffId isActive tokenVersion");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account no longer exists",
      });
    }

    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ success: false, message: "Session has been revoked. Please log in again." });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: "User account is inactive" });
    }

    // Always trust the current database role, not a possibly stale JWT claim.
    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      hospitalId: user.hospital ? user.hospital.toString() : null,
      staffId: user.staffId || null,
    };

    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    return next(error);
  }
};
