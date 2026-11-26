
const mongoose = require("mongoose");
const AuditLog = require("../models/auditLog");

exports.getAuditLogs = async (req, res, next) => {
  try {
    const hospitalId = req.user?.hospitalId;

    // Never return logs without a hospital scope.
    if (!hospitalId || !mongoose.isValidObjectId(hospitalId)) {
      return res.status(403).json({
        success: false,
        message: "Your account is not linked to a valid health centre.",
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 20)
    );

    const { search, action, outcome } = req.query;

    // Every query is restricted to the logged-in user's hospital.
    const filter = { hospital: hospitalId };

    if (action && action !== "all") {
      filter.action = {
        $regex: action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };
    }

    if (["success", "failure"].includes(outcome)) {
      filter.outcome = outcome;
    }

    if (search && search.trim()) {
      const safeSearch = search.trim().slice(0, 100).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      filter.$or = [
        { actorName: { $regex: safeSearch, $options: "i" } },
        { actorRole: { $regex: safeSearch, $options: "i" } },
        { action: { $regex: safeSearch, $options: "i" } },
        { resourceType: { $regex: safeSearch, $options: "i" } },
        { resourceId: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .select(
          "actor actorName actorRole action resourceType resourceId outcome metadata createdAt"
        )
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      AuditLog.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: "Audit logs retrieved successfully.",
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: logs,
    });
  } catch (error) {
    next(error);
  }
};
