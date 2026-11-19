
const mongoose = require("mongoose");
const Joi = require("joi");
const Hospital = require("../models/hospital");
const writeAuditLog = require("../utils/writeAuditLog");

// Fields administrators are allowed to update.
const hospitalUpdateSchema = Joi.object({
  name: Joi.string().trim().min(2).max(150),
  email: Joi.string().trim().lowercase().email().max(150).allow(""),
  phone: Joi.string().trim().max(30).allow(""),
  address: Joi.string().trim().max(300).allow(""),
  city: Joi.string().trim().max(100).allow(""),
  state: Joi.string().trim().max(100).allow(""),
  country: Joi.string().trim().max(100),
})
  .min(1)
  .unknown(false);

// GET: View the current hospital's profile.
exports.getHospitalProfile = async (req, res, next) => {
  try {
    const hospitalId = req.user.hospitalId;

    if (!mongoose.isValidObjectId(hospitalId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid hospital information.",
      });
    }

    const hospital = await Hospital.findById(hospitalId).lean();

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: hospital,
    });
  } catch (error) {
    return next(error);
  }
};

// PATCH: Update the current hospital's profile.
exports.updateHospitalProfile = async (req, res, next) => {
  try {
    const hospitalId = req.user.hospitalId;

    if (!mongoose.isValidObjectId(hospitalId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid hospital information.",
      });
    }

    const { error, value } = hospitalUpdateSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: false,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details.map((detail) => detail.message),
      });
    }

    const hospital = await Hospital.findById(hospitalId);

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found.",
      });
    }

    // Update only fields permitted by the validation schema.
    Object.assign(hospital, value);

    await hospital.save();

    await writeAuditLog(req, {
      action: "hospital.profile_updated",
      resourceType: "hospital",
      resourceId: hospital._id.toString(),
      metadata: {
        updatedFields: Object.keys(value),
      },
    });

    return res.status(200).json({
      success: true,
      message: "Hospital profile updated successfully.",
      data: hospital,
    });
  } catch (error) {
    return next(error);
  }
};
