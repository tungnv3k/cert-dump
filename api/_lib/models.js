import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

function stripIds(ret) {
  const { _id, ...rest } = ret;
  delete rest.__v;
  return {
    id: String(_id),
    ...rest,
    ...(Array.isArray(rest.questions)
      ? {
          questions: rest.questions.map(({ _id: questionId, ...question }) => ({
            id: String(questionId),
            ...question,
          })),
        }
      : {}),
  };
}

const QuestionSchema = new Schema(
  {
    question: { type: String, required: true, trim: true },
    options: {
      type: [String],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length >= 2,
        message: "A question needs at least two options.",
      },
    },
    correctAnswers: {
      type: [Number],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length >= 1,
        message: "A question needs at least one correct answer.",
      },
    },
    multiple: { type: Boolean, default: false },
    explanation: { type: String, default: "", trim: true },
  },
  { id: false },
);

function createCollectionSchema() {
  return new Schema(
    {
      title: { type: String, required: true, trim: true },
      description: { type: String, default: "", trim: true },
      questions: {
        type: [QuestionSchema],
        required: true,
        validate: {
          validator: (value) => Array.isArray(value) && value.length > 0,
          message: "A question bank needs at least one question.",
        },
      },
    },
    {
      id: false,
      timestamps: true,
      toJSON: { transform: (_doc, ret) => stripIds(ret) },
      toObject: { transform: (_doc, ret) => stripIds(ret) },
    },
  );
}

export const Bank = models.Bank || model("Bank", createCollectionSchema(), "banks");
export const Quiz = models.Quiz || model("Quiz", createCollectionSchema(), "quizzes");
