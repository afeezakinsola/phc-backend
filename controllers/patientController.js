
const mongoose = require("mongoose");
const Patient = require("../models/patient");
const PatientSequence = require("../models/patientSequence");
const PDFDocument = require("pdfkit");

const {
  patientSchema,
  updatePatientSchema,
} = require("../validations/patientValidation");

const logger = require("../utils/logger");
const redisClient = require("../config/redis");
const { clearPatientCache } = require("../cache/patientCache");

// Escape special regex characters in search terms.
const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Validate MongoDB IDs.
const validateMongoId = (id) => mongoose.isValidObjectId(id);

// Get the authenticated user's hospital ID.
const getHospitalId = (req) => req.user?.hospitalId;

/*
|--------------------------------------------------------------------------
| DATE OF BIRTH AND AGE HELPERS
|--------------------------------------------------------------------------
*/

// Calculate age using the patient's date of birth.
// UTC date components prevent timezone-related birthday errors.
const calculateAge = (dob) => {
  if (!dob) return undefined;

  const birthDate = new Date(dob);

  if (Number.isNaN(birthDate.getTime())) {
    return undefined;
  }

  const today = new Date();

  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();

  const currentMonth = today.getUTCMonth();
  const birthMonth = birthDate.getUTCMonth();

  const currentDay = today.getUTCDate();
  const birthDay = birthDate.getUTCDate();

  // Reduce the age if the birthday has not happened this year.
  if (
    currentMonth < birthMonth ||
    (currentMonth === birthMonth && currentDay < birthDay)
  ) {
    age--;
  }

  return age;
};

// Calculate BMI for each vital reading.
// Weight must be in kilograms and height must be in centimetres.
const calculateVitalBMI = (vitals = []) => {
  return vitals.map((vital) => {
    const reading = { ...vital };

    // Never trust a BMI value submitted by the frontend.
    delete reading.bmi;

    const weight = Number(reading.weight);
    const height = Number(reading.height);

    if (
      Number.isFinite(weight) &&
      Number.isFinite(height) &&
      weight > 0 &&
      height > 0
    ) {
      const heightInMetres = height / 100;

      reading.bmi = Number(
        (weight / (heightInMetres * heightInMetres)).toFixed(1)
      );
    }

    return reading;
  });
};

// Format DOB without shifting the date because of server timezone.
const formatDateOnly = (value) => {
  if (!value) return "Not recorded";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};

// Prepare patient data for API responses.
// Patients with DOB get a freshly calculated age.
// Legacy patients without DOB keep their previously stored age.
const serializePatient = (patient) => {
  const data = patient.toObject
    ? patient.toObject()
    : { ...patient };

  if (data.dob) {
    const calculatedAge = calculateAge(data.dob);

    if (calculatedAge !== undefined) {
      data.age = calculatedAge;
    }
  }

  return data;
};

/*
|--------------------------------------------------------------------------
| REQUEST HELPERS
|--------------------------------------------------------------------------
*/

// Parse JSON fields submitted through multipart/form-data.
const parseArrayField = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      if (!Array.isArray(parsed)) {
        throw new Error(`${fieldName} must be an array.`);
      }

      return parsed;
    } catch (error) {
      if (error.message === `${fieldName} must be an array.`) {
        throw error;
      }

      throw new Error(`${fieldName} must contain valid JSON array data.`);
    }
  }

  throw new Error(`${fieldName} must be an array.`);
};

// Convert old singular visit date to the stored dateOfVisits array.
const normalizeVisitDates = (data) => {
  const normalized = { ...data };

  if (typeof normalized.dateOfVisits === "string") {
    try {
      const parsed = JSON.parse(normalized.dateOfVisits);

      if (!Array.isArray(parsed)) {
        throw new Error();
      }

      normalized.dateOfVisits = parsed;
    } catch {
      normalized.dateOfVisits = [normalized.dateOfVisits];
    }
  }

  if (normalized.dateOfVisit && !normalized.dateOfVisits) {
    normalized.dateOfVisits = [normalized.dateOfVisit];
  }

  delete normalized.dateOfVisit;

  return normalized;
};

/*
|--------------------------------------------------------------------------
| PATIENT ID GENERATOR
|--------------------------------------------------------------------------
*/

// Generate the next patient ID for a hospital.
// Atomic increment prevents duplicate sequence numbers.
const generatePatientId = async (hospitalId) => {
  try {
    const counter = await PatientSequence.findOneAndUpdate(
      { hospital: hospitalId },
      { $inc: { sequence: 1 } },
      {
        returnDocument: "after",
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    return `PAT-${String(counter.sequence).padStart(6, "0")}`;
  } catch (error) {
    // Handle two requests creating the first counter simultaneously.
    if (error.code === 11000) {
      const counter = await PatientSequence.findOneAndUpdate(
        { hospital: hospitalId },
        { $inc: { sequence: 1 } },
        { returnDocument: "after" }
      );

      if (counter) {
        return `PAT-${String(counter.sequence).padStart(6, "0")}`;
      }
    }

    throw error;
  }
};

/*
|--------------------------------------------------------------------------
| CREATE PATIENT
|--------------------------------------------------------------------------
*/

exports.createPatient = async (req, res, next) => {
  try {
    const hospitalId = getHospitalId(req);

    if (!hospitalId || !validateMongoId(String(hospitalId))) {
      return res.status(403).json({
        success: false,
        message: "Your account is not assigned to a valid hospital.",
      });
    }

    const input = { ...req.body };

    // Never accept hospital ownership or patient ID from the client.
    delete input.hospital;
    delete input.patientId;
    delete input.attachments;
    delete input.files;

    // Age is calculated by the backend, never supplied by the client.
    delete input.age;

    if (typeof input.gender === "string") {
      input.gender = input.gender.trim().toLowerCase();
    }

    // Parse nested multipart fields.
    input.nextOfKin = parseArrayField(input.nextOfKin, "nextOfKin");
    input.vitals = parseArrayField(input.vitals, "vitals");

    const normalizedInput = normalizeVisitDates(input);

    // Generate the compatibility full name.
    normalizedInput.name = [
      normalizedInput.firstName,
      normalizedInput.middleName,
      normalizedInput.lastName,
    ]
      .filter(Boolean)
      .join(" ");

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

      // Calculate BMI for every vital reading submitted during registration.
      if (value.vitals && value.vitals.length > 0) {
      value.vitals = calculateVitalBMI(value.vitals);
      }

    // Check whether this NIN already exists in this hospital.
    const existingPatient = await Patient.findOne({
      hospital: hospitalId,
      nin: value.nin,
    }).select("_id");

    if (existingPatient) {
      return res.status(409).json({
        success: false,
        message: "A patient with this NIN already exists in your hospital.",
      });
    }

    const patientId = await generatePatientId(hospitalId);

    const files = req.files
      ? req.files.map((file) => file.path)
      : [];

      const patient = await Patient.create({
  ...value,
  hospital: hospitalId,
  patientId,
  attachments: files,
});

// Make the new patient's MongoDB ID available to the audit middleware.
// This allows the creation log to identify the exact patient.
res.locals.auditResourceId = patient._id.toString();

await clearPatientCache();

    logger.info(`Patient created: ${patient.patientId}`);

    return res.status(201).json({
      success: true,
      message: "Patient created successfully.",
      data: serializePatient(patient),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A patient with this patient ID or NIN already exists.",
      });
    }

    return next(error);
  }
};

/*
|--------------------------------------------------------------------------
| GET ALL PATIENTS
|--------------------------------------------------------------------------
*/

exports.getPatients = async (req, res, next) => {
  try {
    const hospitalId = getHospitalId(req);

    if (!hospitalId || !validateMongoId(String(hospitalId))) {
      return res.status(403).json({
        success: false,
        message: "Your account is not assigned to a valid hospital.",
      });
    }

    const {
      page = 1,
      limit = 10,
      name,
      gender,
      diagnosis,
      date,
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);

    const limitNumber = Math.min(
      Math.max(parseInt(limit, 10) || 10, 1),
      100
    );

    // Every patient search is restricted to the authenticated hospital.
    const query = { hospital: hospitalId };

    if (name) {
      query.$or = [
        { name: { $regex: escapeRegex(String(name)), $options: "i" } },
        { firstName: { $regex: escapeRegex(String(name)), $options: "i" } },
        { lastName: { $regex: escapeRegex(String(name)), $options: "i" } },
        { patientId: { $regex: escapeRegex(String(name)), $options: "i" } },
      ];
    }

    if (gender) {
      query.gender = String(gender).trim().toLowerCase();
    }

    if (diagnosis) {
      query.diagnosis = {
        $regex: escapeRegex(String(diagnosis)),
        $options: "i",
      };
    }

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

    // Include hospital ID in cache key to prevent cross-hospital data leaks.
    const cacheKey = `patients:${String(hospitalId)}:${JSON.stringify({
      ...req.query,
      page: pageNumber,
      limit: limitNumber,
    })}`;

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

    // Calculate age before putting the response into Redis.
    const patientData = patients.map(serializePatient);

    const response = {
      source: "mongodb",
      success: true,
      total,
      page: pageNumber,
      pages: Math.ceil(total / limitNumber),
      count: patientData.length,
      data: patientData,
    };

    await redisClient.set(cacheKey, JSON.stringify(response), {
      EX: 60,
    });

    return res.status(200).json(response);
  } catch (error) {
    return next(error);
  }
};

/*
|--------------------------------------------------------------------------
| GET ONE PATIENT
|--------------------------------------------------------------------------
*/

exports.getPatientById = async (req, res, next) => {
  try {
    const hospitalId = getHospitalId(req);
    const { id } = req.params;

    if (!validateMongoId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID.",
      });
    }

    if (!hospitalId || !validateMongoId(String(hospitalId))) {
      return res.status(403).json({
        success: false,
        message: "Your account is not assigned to a valid hospital.",
      });
    }

    const patient = await Patient.findOne({
      _id: id,
      hospital: hospitalId,
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: serializePatient(patient),
    });
  } catch (error) {
    return next(error);
  }
};

/*
|--------------------------------------------------------------------------
| DELETE PATIENT
|--------------------------------------------------------------------------
*/

exports.deletePatient = async (req, res, next) => {
  try {
    const hospitalId = getHospitalId(req);

    if (!validateMongoId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID.",
      });
    }

    if (!hospitalId || !validateMongoId(String(hospitalId))) {
      return res.status(403).json({
        success: false,
        message: "Your account is not assigned to a valid hospital.",
      });
    }

    const patient = await Patient.findOneAndDelete({
      _id: req.params.id,
      hospital: hospitalId,
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found.",
      });
    }

    await clearPatientCache();

    logger.warn(`Patient deleted: ${patient.patientId}`);

    return res.status(200).json({
      success: true,
      message: "Patient deleted successfully.",
    });
  } catch (error) {
    return next(error);
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE PATIENT
|--------------------------------------------------------------------------
*/


exports.updatePatient = async (req, res, next) => {
  try {
    const hospitalId = getHospitalId(req);

    if (!validateMongoId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID.",
      });
    }

    if (!hospitalId || !validateMongoId(String(hospitalId))) {
      return res.status(403).json({
        success: false,
        message: "Your account is not assigned to a valid hospital.",
      });
    }

    const input = { ...req.body };

    // Prevent changing ownership or generated identifiers.
    delete input.hospital;
    delete input.patientId;

    // Age is derived from DOB, not accepted from the client.
    delete input.age;

    if (typeof input.gender === "string") {
      input.gender = input.gender.trim().toLowerCase();
    }

    input.nextOfKin = parseArrayField(input.nextOfKin, "nextOfKin");
    input.vitals = parseArrayField(input.vitals, "vitals");

    const normalizedInput = normalizeVisitDates(input);

    const { error, value } = updatePatientSchema.validate(
      normalizedInput,
      {
        abortEarly: true,
        convert: true,
      }
    );

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const patient = await Patient.findOne({
      _id: req.params.id,
      hospital: hospitalId,
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found.",
      });
    }

    // Check whether the new NIN belongs to another patient
    // in this same hospital.
    if (value.nin && value.nin !== patient.nin) {
      const existingPatient = await Patient.findOne({
        hospital: hospitalId,
        nin: value.nin,
        _id: { $ne: patient._id },
      }).select("_id");

      if (existingPatient) {
        return res.status(409).json({
          success: false,
          message: "This NIN is already registered to another patient.",
        });
      }
    }

        // Calculate BMI for new readings before appending them.
        // Existing vital history is never overwritten.
          const newVitals = value.vitals
           ? calculateVitalBMI(value.vitals)
            : [];

          delete value.vitals;
    // Update ordinary fields, including NIN when supplied.
    Object.assign(patient, value);

    // If DOB is supplied, remove the old stored age.
    // The API will calculate the current age from the new DOB.
    if (value.dob !== undefined) {
      patient.age = undefined;
    }

    // Rebuild the compatibility full name if name components change.
    if (
      value.firstName !== undefined ||
      value.middleName !== undefined ||
      value.lastName !== undefined
    ) {
      patient.name = [
        patient.firstName,
        patient.middleName,
        patient.lastName,
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (newVitals && newVitals.length > 0) {
      patient.vitals.push(...newVitals);
    }

    await patient.save();

    await clearPatientCache();

    logger.info(`Patient updated: ${patient.patientId}`);

    return res.status(200).json({
      success: true,
      message: "Patient updated successfully.",
      data: serializePatient(patient),
    });
  } catch (error) {
    return next(error);
  }
};


/*
|--------------------------------------------------------------------------
| EXPORT PATIENT PDF
|--------------------------------------------------------------------------
*/


exports.exportPDF = async (req, res, next) => {
  try {
    const hospitalId = getHospitalId(req);

    if (!validateMongoId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID.",
      });
    }

    if (!hospitalId || !validateMongoId(String(hospitalId))) {
      return res.status(403).json({
        success: false,
        message: "Your account is not assigned to a valid hospital.",
      });
    }

    const patient = await Patient.findOne({
      _id: req.params.id,
      hospital: hospitalId,
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found.",
      });
    }

    const doc = new PDFDocument();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="patient-${patient.patientId}.pdf"`
    );

    doc.pipe(res);

    doc.fontSize(18).text("Patient Record", {
      underline: true,
    });

    doc.moveDown();

    const age = patient.dob
      ? calculateAge(patient.dob)
      : patient.age;

    doc.fontSize(12);
    doc.text(`Patient ID: ${patient.patientId || "Not assigned"}`);
    doc.text(`Name: ${patient.name || "Not recorded"}`);
    doc.text(`Date of Birth: ${formatDateOnly(patient.dob)}`);
    doc.text(`Age: ${age ?? "Not recorded"}`);
    doc.text(`Gender: ${patient.gender || "Not recorded"}`);
    doc.text(`Phone: ${patient.phone || "Not recorded"}`);

    doc.text(
      `Visit dates: ${
        (patient.dateOfVisits || [])
          .map((date) => new Date(date).toLocaleDateString())
          .join(", ") || "Not recorded"
      }`
    );

    doc.moveDown();

    doc.fontSize(14).text("Medical Information");

    doc.fontSize(12);
    doc.text(`Diagnosis: ${patient.diagnosis || "Not recorded"}`);
    doc.text(`Treatment: ${patient.treatment || "Not recorded"}`);
    doc.text(`Notes: ${patient.notes || "None"}`);

    doc.moveDown();

    doc.fontSize(14).text("Vital Signs History");
    doc.fontSize(10);

    if (patient.vitals && patient.vitals.length > 0) {
      patient.vitals.forEach((vital, index) => {
        doc.moveDown(0.5);
        doc.fontSize(11).text(`Reading ${index + 1}`);
        doc.fontSize(10);

        doc.text(
          `Recorded: ${
            vital.recordedAt
              ? new Date(vital.recordedAt).toLocaleString()
              : "Not recorded"
          }`
        );

        doc.text(
          `Blood pressure: ${vital.bloodPressure || "Not recorded"}`
        );

        doc.text(
          `Weight: ${
            vital.weight !== undefined
              ? `${vital.weight} kg`
              : "Not recorded"
          }`
        );

        doc.text(
          `Height: ${
            vital.height !== undefined
              ? `${vital.height} cm`
              : "Not recorded"
          }`
        );

        doc.text(
          `BMI: ${vital.bmi ?? "Not calculated"}`
        );

        doc.text(
          `Temperature: ${
            vital.temperature !== undefined
              ? `${vital.temperature} °C`
              : "Not recorded"
          }`
        );

        doc.text(`Pulse: ${vital.pulse ?? "Not recorded"} bpm`);

        doc.text(
          `Respiratory rate: ${
            vital.respiratoryRate !== undefined
              ? `${vital.respiratoryRate} breaths/min`
              : "Not recorded"
          }`
        );

        doc.text(
          `Blood glucose: ${
            vital.bloodGlucose !== undefined
              ? `${vital.bloodGlucose} ${vital.bloodGlucoseUnit || ""}`
              : "Not recorded"
          }`
        );

        doc.text(
          `Oxygen saturation (SpO2): ${
            vital.oxygenSaturation !== undefined
              ? `${vital.oxygenSaturation}%`
              : "Not recorded"
          }`
        );
      });
    } else {
      doc.text("No vital readings recorded.");
    }

    doc.end();
  } catch (error) {
    return next(error);
  }
};
