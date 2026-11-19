
require("dotenv").config();

const dns = require("node:dns");
dns.setServers(["1.1.1.1", "1.0.0.1"]);

const mongoose = require("mongoose");
const User = require("../models/user");
const StaffSequence = require("../models/staffSequence");

async function initializeStaffSequences() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const roles = ["admin", "doctor", "nurse"];

    for (const role of roles) {
      const users = await User.find(
        { role },
        { hospital: 1, staffId: 1 }
      ).lean();

      const counters = new Map();

      for (const user of users) {
        if (!user.hospital || !user.staffId) continue;

        const prefix = {
          admin: "ADM",
          doctor: "DOC",
          nurse: "NUR",
        }[role];

        const match = user.staffId.match(
          new RegExp(`^${prefix}-(\\d+)$`)
        );

        if (!match) {
          throw new Error(
            `Unexpected staff ID format: ${user.staffId}`
          );
        }

        const currentNumber = Number(match[1]);
        const hospitalId = user.hospital.toString();

        counters.set(
          hospitalId,
          Math.max(counters.get(hospitalId) || 0, currentNumber)
        );
      }

      for (const [hospitalId, sequence] of counters) {
        await StaffSequence.updateOne(
          { hospital: hospitalId, role },
          {
            $max: { sequence },
            $setOnInsert: {
              hospital: hospitalId,
              role,
            },
          },
          { upsert: true }
        );

        console.log(
          `${role}: hospital ${hospitalId} initialized at ${sequence}`
        );
      }
    }

    console.log("Staff sequence initialization completed.");
  } catch (error) {
    console.error("Initialization failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

initializeStaffSequences();
