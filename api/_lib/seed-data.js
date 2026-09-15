import { Bank, Quiz } from "./models.js";

// Mock content seeded automatically the first time the app connects to an
// empty database (see ensureSeedData below), so a fresh MONGODB_URI has
// something to show without anyone having to run a script by hand.

function pickQuestionFields({ question, options, correctAnswers, multiple, explanation }) {
  return { question, options, correctAnswers, multiple, explanation };
}

const MOCK_BANKS = [
  {
    title: "[MOCK] Cloud Fundamentals",
    description: "Sample question bank seeded automatically to verify the database connection.",
    questions: [
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
    ],
  },
  {
    title: "[MOCK] Networking Basics",
    description: "Sample question bank seeded automatically to verify the database connection.",
    questions: [
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
        explanation:
          "TCP and UDP operate at the transport layer; IP is network layer and HTTP is application layer.",
      },
      {
        question: "What port does HTTPS use by default?",
        options: ["21", "80", "443", "8080"],
        correctAnswers: [2],
        multiple: false,
        explanation: "HTTPS defaults to port 443.",
      },
    ],
  },
];

const MOCK_QUIZ_TITLE = "[MOCK] Cloud + Networking combined quiz";

export const MOCK_TITLES = [...MOCK_BANKS.map((bank) => bank.title), MOCK_QUIZ_TITLE];

async function ensureBankSeeded(bank) {
  const existing = await Bank.findOne({ title: bank.title });
  if (existing) return existing;
  return Bank.create(bank);
}

async function ensureQuizSeeded(banks) {
  const existing = await Quiz.findOne({ title: MOCK_QUIZ_TITLE });
  if (existing) return existing;

  return Quiz.create({
    title: MOCK_QUIZ_TITLE,
    description: `Combined from ${banks.map((bank) => bank.title).join(", ")}`,
    questions: banks.flatMap((bank) => bank.questions.map(pickQuestionFields)),
  });
}

// Idempotent: checks each collection for its mock document by title before
// creating anything, so it's safe to call on every cold start.
export async function ensureSeedData() {
  const banks = [];
  for (const mockBank of MOCK_BANKS) {
    banks.push(await ensureBankSeeded(mockBank));
  }
  await ensureQuizSeeded(banks);
}
