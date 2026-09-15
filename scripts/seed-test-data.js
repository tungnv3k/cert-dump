// The app now seeds its own "[MOCK]" question banks/quiz automatically the
// first time it connects to an empty database (see api/_lib/seed-data.js,
// called from api/_lib/db.js on every cold start). This script is a manual
// entry point for the same logic, plus a --clean flag to remove that mock
// data again. Run with MONGODB_URI set in the environment:
//
//   MONGODB_URI="mongodb+srv://..." node scripts/seed-test-data.js
//   MONGODB_URI="mongodb+srv://..." node scripts/seed-test-data.js --clean

import mongoose from "mongoose";

import { connectToDatabase } from "../api/_lib/db.js";
import { MOCK_TITLES } from "../api/_lib/seed-data.js";
import { Bank, Quiz } from "../api/_lib/models.js";

async function seed() {
  // connectToDatabase() runs the idempotent seed check itself.
  await connectToDatabase();

  const bankCount = await Bank.countDocuments();
  const quizCount = await Quiz.countDocuments();

  console.log("Connected to MongoDB and ensured mock data exists.\n");
  console.log(`Total banks in DB: ${bankCount}`);
  console.log(`Total quizzes in DB: ${quizCount}`);
  console.log(
    '\nOpen the app and check the Question banks / Quizzes tabs for the "[MOCK]" items.',
  );
  console.log("Remove them again with: node scripts/seed-test-data.js --clean");
}

async function clean() {
  await connectToDatabase();

  const bankResult = await Bank.deleteMany({ title: { $in: MOCK_TITLES } });
  const quizResult = await Quiz.deleteMany({ title: { $in: MOCK_TITLES } });

  console.log(
    `Removed ${bankResult.deletedCount} mock bank(s) and ${quizResult.deletedCount} mock quiz(zes).`,
  );
}

const shouldClean = process.argv.includes("--clean");

(shouldClean ? clean() : seed())
  .catch((error) => {
    console.error("\nFailed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
