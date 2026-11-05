/*
// handle patient record operations
const Patient = require("../models/patient");
const PDFDocument = require("pdfkit");
const {
  patientSchema,
  updatePatientSchema,
} = require("../validations/patientValidation");
const logger = require("../utils/logger");
const AppError = require("../utils/AppError");
const redisClient = require("../config/redis");
const { clearPatientCache } = require("../cache/patientCache");

// create patient record

exports.createPatient = async (req, res, next) => {
  try {
    // Normalize input
    if (req.body.gender) {
      req.body.gender = req.body.gender.trim().toLowerCase();
    }

    if (req.body.name) {
      req.body.name = req.body.name.trim();
    }

    // Validate request body
    const { error } = patientSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    // Handle uploaded files
    const files = req.files ? req.files.map((file) => file.path) : [];

    // Create patient
    const patient = await Patient.create({
      ...req.body,
      attachments: files,
    });

    // Clear patient cache
    await clearPatientCache();

    logger.info(`Patient created: ${patient.name}`);

    res.status(201).json({
      success: true,
      message: "Patient created successfully",
      data: patient,
    });
  } catch (error) {
    next(error);
  }
};

// Get all patients with pagination, search, filtering and Redis caching

exports.getPatients = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, name, gender, diagnosis, date } = req.query;

    const pageNumber = Math.max(parseInt(page) || 1, 1);
    const limitNumber = Math.max(parseInt(limit) || 10, 1);

    const query = {};

    // Search patient by name (case-insensitive)
    if (name) {
      query.name = {
        $regex: name,
        $options: "i",
      };
    }

    // Filter by gender
    if (gender) {
      query.gender = gender.toLowerCase();
    }

    // Filter by diagnosis
    if (diagnosis) {
      query.diagnosis = {
        $regex: diagnosis,
        $options: "i",
      };
    }

    // Filter by visit date
    if (date) {
      const start = new Date(date);
      const end = new Date(date);

      end.setDate(end.getDate() + 1);

      query.dateOfVisit = {
        $gte: start,
        $lt: end,
      };
    }

    const cacheKey = `patients:${JSON.stringify(req.query)}`;

    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        source: "redis-cache",
        ...JSON.parse(cachedData),
      });
    }

    const total = await Patient.countDocuments(query);

    const patients = await Patient.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber);

    const response = {
      source: "mongodb",
      total,
      page: pageNumber,
      pages: Math.ceil(total / limitNumber),
      count: patients.length,
      data: patients,
    };

    await redisClient.set(cacheKey, JSON.stringify(response), {
      EX: 60,
    });

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

// Delete patient
// Delete patient by ID (Doctor only)
exports.deletePatient = async (req, res, next) => {
  try {
    // Only doctors can delete patients
    if (req.user.role !== "doctor") {
      return next(new AppError("Only doctors can delete patients", 403));
    }

    const patient = await Patient.findByIdAndDelete(req.params.id);

    if (!patient) {
      return next(new AppError("Patient not found", 404));
    }

    // Clear patient cache
    await clearPatientCache();

    logger.warn(`Patient deleted: ${patient.name}`);

    res.status(200).json({
      success: true,
      message: "Patient deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// Update patient by ID
exports.updatePatient = async (req, res, next) => {
  try {
    // Validate request body
    const { error } = updatePatientSchema.validate(req.body, {
      allowUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const updatedPatient = await Patient.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      },
    );

    if (!updatedPatient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    // Clear patient cache
    await clearPatientCache();

    logger.info(`Patient updated: ${updatedPatient.name}`);

    res.status(200).json({
      success: true,
      message: "Patient updated successfully",
      data: updatedPatient,
    });
  } catch (error) {
    next(error);
  }
};

// Export patient record as PDF
exports.exportPDF = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    const doc = new PDFDocument();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="patient-${patient._id}.pdf"`,
    );

    doc.pipe(res);

    doc.text(`Name: ${patient.name}`);
    doc.text(`Diagnosis: ${patient.diagnosis}`);
    doc.text(`Treatment: ${patient.treatment}`);

    doc.end();
  } catch (error) {
    next(error);
  }
};
*/

// Handle patient record operations.
const mongoose = require("mongoose");
const Patient = require("../models/patient");
const PDFDocument = require("pdfkit");
const {
  patientSchema,
  updatePatientSchema,
} = require("../validations/patientValidation");
const logger = require("../utils/logger");
const redisClient = require("../config/redis");
const { clearPatientCache } = require("../cache/patientCache");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeVisitDates = (data) => {
  const normalized = { ...data };

  if (typeof normalized.dateOfVisits === "string") {
    try {
      const parsed = JSON.parse(normalized.dateOfVisits);
      if (Array.isArray(parsed)) normalized.dateOfVisits = parsed;
    } catch (_) {
      normalized.dateOfVisits = [normalized.dateOfVisits];
    }
  }

  if (normalized.dateOfVisit && !normalized.dateOfVisits) {
    normalized.dateOfVisits = [normalized.dateOfVisit];
  }

  delete normalized.dateOfVisit;
  return normalized;
};

const validateMongoId = (id) => mongoose.isValidObjectId(id);

// Create a patient record.
exports.createPatient = async (req, res, next) => {
  try {
    const input = { ...req.body };

    delete input.files;

if (typeof input.gender === "string") {
  input.gender = input.gender.trim().toLowerCase();
}

if (typeof input.name === "string") {
  input.name = input.name.trim();
}

const normalizedInput = normalizeVisitDates(input);

const { error, value } = patientSchema.validate(normalizedInput, {
  abortEarly: true,
  convert: true,
});

if (error) {
  return res.status(400).json({
    success: false,
    message: error.details[0].message,
  });
}

const files = req.files ? req.files.map((file) => file.path) : [];

const patient = await Patient.create({
  ...value,
  attachments: files,
});
    await clearPatientCache();
    logger.info(`Patient created: ${patient.name}`);

    return res.status(201).json({
      success: true,
      message: "Patient created successfully",
      data: patient,
    });
  } catch (error) {
    return next(error);
  }
};

// Get patients with pagination, search, filters and Redis caching.
exports.getPatients = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, name, gender, diagnosis, date } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const query = {};

    if (name) {
      query.name = { $regex: escapeRegex(String(name)), $options: "i" };
    }

    if (gender) query.gender = String(gender).toLowerCase();

    if (diagnosis) {
      query.diagnosis = {
        $regex: escapeRegex(String(diagnosis)),
        $options: "i",
      };
    }

    // The persisted model uses dateOfVisits (an array), not dateOfVisit.
    if (date) {
      const start = new Date(date);
      if (Number.isNaN(start.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date filter. Use a valid date.",
        });
      }
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      query.dateOfVisits = {
        $elemMatch: { $gte: start, $lt: end },
      };
    }

    const cacheKey = `patients:${JSON.stringify({ ...req.query, page: pageNumber, limit: limitNumber })}`;
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        source: "redis-cache",
        ...JSON.parse(cachedData),
      });
    }

    const total = await Patient.countDocuments(query);
    const patients = await Patient.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber);

    const response = {
      source: "mongodb",
      success: true,
      total,
      page: pageNumber,
      pages: Math.ceil(total / limitNumber),
      count: patients.length,
      data: patients,
    };

    await redisClient.set(cacheKey, JSON.stringify(response), { EX: 60 });
    return res.status(200).json(response);
  } catch (error) {
    return next(error);
  }
};

// Retrieve one patient's complete profile by MongoDB ID.
exports.getPatientById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!validateMongoId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID",
      });
    }

    const patient = await Patient.findById(id);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    return res.status(200).json({ success: true, data: patient });
  } catch (error) {
    return next(error);
  }
};

// Delete patient. Authorization is enforced by route middleware for both roles.
exports.deletePatient = async (req, res, next) => {
  try {
    if (!validateMongoId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID",
      });
    }

    const patient = await Patient.findByIdAndDelete(req.params.id);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    await clearPatientCache();
    logger.warn(`Patient deleted: ${patient.name}`);

    return res.status(200).json({
      success: true,
      message: "Patient deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};

// Update patient by ID.
exports.updatePatient = async (req, res, next) => {
  try {
    if (!validateMongoId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID",
      });
    }

    const input = { ...req.body };
    if (typeof input.gender === "string") input.gender = input.gender.trim().toLowerCase();
    if (typeof input.name === "string") input.name = input.name.trim();

    const normalizedInput = normalizeVisitDates(input);
    const { error, value } = updatePatientSchema.validate(normalizedInput, {
      abortEarly: true,
      convert: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const updatedPatient = await Patient.findByIdAndUpdate(
      req.params.id,
      value,
      { new: true, runValidators: true },
    );

    if (!updatedPatient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    await clearPatientCache();
    logger.info(`Patient updated: ${updatedPatient.name}`);

    return res.status(200).json({
      success: true,
      message: "Patient updated successfully",
      data: updatedPatient,
    });
  } catch (error) {
    return next(error);
  }
};

// Export a patient record as PDF.
exports.exportPDF = async (req, res, next) => {
  try {
    if (!validateMongoId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID",
      });
    }

    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="patient-${patient._id}.pdf"`,
    );

    doc.pipe(res);
    doc.fontSize(18).text("Patient Record", { underline: true });
    doc.moveDown();
    doc.fontSize(12).text(`Patient ID: ${patient._id}`);
    doc.text(`Name: ${patient.name}`);
    doc.text(`Age: ${patient.age}`);
    doc.text(`Gender: ${patient.gender}`);
    doc.text(
      `Visit dates: ${(patient.dateOfVisits || []).map((date) => new Date(date).toLocaleDateString()).join(", ") || "Not recorded"}`,
    );
    doc.text(`Diagnosis: ${patient.diagnosis || "Not recorded"}`);
    doc.text(`Treatment: ${patient.treatment || "Not recorded"}`);
    doc.text(`Notes: ${patient.notes || "None"}`);
    doc.end();
  } catch (error) {
    return next(error);
  }
};
