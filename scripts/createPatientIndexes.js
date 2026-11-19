
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Patient = require("../models/patient");

const createPatientIndexes = async () => {
  try {
    await connectDB();

    // Create the indexes declared in the Patient schema.
    // Unlike syncIndexes(), this does not remove existing indexes.
    await Patient.createIndexes();

    console.log("Patient indexes created successfully.");

    const indexes = await Patient.collection.indexes();

    console.log("Current Patient indexes:");
    console.table(
      indexes.map((index) => ({
        name: index.name,
        keys: JSON.stringify(index.key),
        unique: index.unique || false,
      }))
    );
  } catch (error) {
    console.error("Patient index creation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

createPatientIndexes();