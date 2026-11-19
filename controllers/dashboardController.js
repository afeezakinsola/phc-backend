
const User = require("../models/user");
const Invitation = require("../models/invitation");

exports.getDashboardStats = async (req, res, next) => {
  try {
    const hospitalId = req.user.hospitalId;

    const [
      totalStaff,
      activeStaff,
      inactiveStaff,
      doctors,
      nurses,
      administrators,
      pendingInvitations,
    ] = await Promise.all([
      User.countDocuments({ hospital: hospitalId }),

      User.countDocuments({
        hospital: hospitalId,
        isActive: true,
      }),

      User.countDocuments({
        hospital: hospitalId,
        isActive: false,
      }),

      User.countDocuments({
        hospital: hospitalId,
        role: "doctor",
        isActive: true,
      }),

      User.countDocuments({
        hospital: hospitalId,
        role: "nurse",
        isActive: true,
      }),

      User.countDocuments({
        hospital: hospitalId,
        role: "admin",
        isActive: true,
      }),

      Invitation.countDocuments({
        hospital: hospitalId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        staff: {
          total: totalStaff,
          active: activeStaff,
          inactive: inactiveStaff,
        },
        roles: {
          doctors,
          nurses,
          administrators,
        },
        invitations: {
          pending: pendingInvitations,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};
