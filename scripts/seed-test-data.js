// One-off connectivity check: creates a couple of "[TEST]" question banks and
// a quiz combining them directly through the app's own Mongoose models, so you
// can confirm MONGODB_URI actually works end-to-end (write + read) and see the
// data show up in the app's UI. Run with MONGODB_URI set in the environment:
//
//   MONGODB_URI="mongodb+srv://..." node scripts/seed-test-data.js
//   MONGODB_URI="mongodb+srv://..." node scripts/seed-test-data.js --clean
//
// This does not run automatically anywhere (not part of build/deploy).

import mongoose from "mongoose";

import { connectToDatabase } from "../api/_lib/db.js";
import { Bank, Quiz } from "../api/_lib/models.js";

const TEST_TITLE_PREFIX = "[TEST]";

const cloudQuestions = [
  {
    question:
      "Which service model gives you the most control over the underlying infrastructure?",
    options: ["SaaS", "PaaS", "IaaS", "FaaS"],
    correctAnswers: [2],
    multiple: false,
    explanation: "IaaS gives you the most control, since you manage the OS and above.",
  },
  {
    question: "Which of these are common cloud deployment models?",
    options: ["Public", "Private", "Hybrid", "Monolithic"],
    correctAnswers: [0, 1, 2],
    multiple: true,
    explanation:
      "Public, private, and hybrid are deployment models; monolithic describes an application architecture, not a deployment model.",
  },
  {
    question: "What does elasticity mean in cloud computing?",
    options: [
      "Data is encrypted at rest",
      "Resources scale automatically with demand",
      "Servers never fail",
      "Billing is fixed monthly",
    ],
    correctAnswers: [1],
    multiple: false,
    explanation: "Elasticity is the ability to scale resources up or down automatically.",
  },
];

const networkingQuestions = [
  {
    question: "Which OSI layer is responsible for routing?",
    options: ["Physical", "Data Link", "Network", "Transport"],
    correctAnswers: [2],
    multiple: false,
    explanation: "Routing happens at Layer 3, the Network layer.",
  },
  {
    question: "Which of these are transport layer protocols?",
    options: ["TCP", "UDP", "IP", "HTTP"],
    correctAnswers: [0, 1],
    multiple: true,
    explanation: "TCP and UDP operate at the transport layer; IP is network layer and HTTP is application layer.",
  },
  {
    question: "What port does HTTPS use by default?",
    options: ["21", "80", "443", "8080"],
    correctAnswers: [2],
    multiple: false,
    explanation: "HTTPS defaults to port 443.",
  },
];

async function seed() {
  await connectToDatabase();
  console.log("Connected to MongoDB.\n");

  const cloudBank = await Bank.create({
    title: `${TEST_TITLE_PREFIX} Cloud Fundamentals`,
    description: "Seeded by scripts/seed-test-data.js to verify the MongoDB connection.",
    questions: cloudQuestions,
  });

  const networkingBank = await Bank.create({
    title: `${TEST_TITLE_PREFIX} Networking Basics`,
    description: "Seeded by scripts/seed-test-data.js to verify the MongoDB connection.",
    questions: networkingQuestions,
  });

  const quiz = await Quiz.create({
    title: `${TEST_TITLE_PREFIX} Cloud + Networking combined quiz`,
    description: `Combined from ${cloudBank.title}, ${networkingBank.title}`,
    questions: [...cloudBank.questions, ...networkingBank.questions].map(
      ({ question, options, correctAnswers, multiple, explanation }) => ({
        question,
        options,
        correctAnswers,
        multiple,
        explanation,
      }),
    ),
  });

  const bankCount = await Bank.countDocuments();
  const quizCount = await Quiz.countDocuments();

  console.log(`Created bank: "${cloudBank.title}" (${cloudBank._id})`);
  console.log(`Created bank: "${networkingBank.title}" (${networkingBank._id})`);
  console.log(
    `Created quiz: "${quiz.title}" (${quiz._id}, ${quiz.questions.length} questions)`,
  );
  console.log(`\nTotal banks in DB: ${bankCount}`);
  console.log(`Total quizzes in DB: ${quizCount}`);
  console.log(
    '\nOpen the app and check the Question banks / Quizzes tabs for the "[TEST]" items.',
  );
  console.log("Remove them again with: node scripts/seed-test-data.js --clean");
}

async function clean() {
  await connectToDatabase();
  console.log("Connected to MongoDB.\n");

  const bankResult = await Bank.deleteMany({ title: { $regex: /^\[TEST\]/ } });
  const quizResult = await Quiz.deleteMany({ title: { $regex: /^\[TEST\]/ } });

  console.log(
    `Removed ${bankResult.deletedCount} test bank(s) and ${quizResult.deletedCount} test quiz(zes).`,
  );
}

const shouldClean = process.argv.includes("--clean");

(shouldClean ? clean() : seed())
  .catch((error) => {
    console.error("\nFailed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
