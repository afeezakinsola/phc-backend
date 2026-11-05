/*
const Joi = require("joi");

// Patient validation schema
const patientSchema = Joi.object({
  // Patient full name
  name: Joi.string().min(3).max(100).required(),

  // Patient age
  age: Joi.number().integer().min(0).max(120).required(),

  // Gender validation
  gender: Joi.string().valid("male", "female").required(),

  // Date of visit
  dateOfVisit: Joi.date().required(),

  // Diagnosis field
  diagnosis: Joi.string().min(3).required(),

  // Treatment / prescription
  treatment: Joi.string().min(3).required(),

  // Optional notes
  notes: Joi.string().allow(""),
});

// Update Patient (all fields optional)
const updatePatientSchema = Joi.object({
  name: Joi.string(),
  age: Joi.number(),
  gender: Joi.string(),
  diagnosis: Joi.string(),
  treatment: Joi.string(),
  notes: Joi.string().allow(""),
}).min(1);

module.exports = {
  patientSchema,
  updatePatientSchema,
};
*/

const Joi = require("joi");

const visitDate = Joi.date().iso();

// dateOfVisit is accepted temporarily for backward compatibility with
// clients using the old singular field. Controllers normalize it to the
// actual MongoDB field: dateOfVisits (an array of dates).
const patientSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100).required(),
  age: Joi.number().integer().min(0).max(120).required(),
  gender: Joi.string().trim().lowercase().valid("male", "female").required(),
  dateOfVisit: visitDate,
  dateOfVisits: Joi.array().items(visitDate).min(1),
  diagnosis: Joi.string().trim().min(3).required(),
  treatment: Joi.string().trim().min(3).required(),
  notes: Joi.string().allow("").default(""),
}).or("dateOfVisit", "dateOfVisits");

const updatePatientSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100),
  age: Joi.number().integer().min(0).max(120),
  gender: Joi.string().trim().lowercase().valid("male", "female"),
  dateOfVisit: visitDate,
  dateOfVisits: Joi.array().items(visitDate).min(1),
  diagnosis: Joi.string().trim().min(3),
  treatment: Joi.string().trim().min(3),
  notes: Joi.string().allow(""),
})
  .or(
    "name",
    "age",
    "gender",
    "dateOfVisit",
    "dateOfVisits",
    "diagnosis",
    "treatment",
    "notes",
  )
  .unknown(false);

module.exports = {
  patientSchema,
  updatePatientSchema,
};
