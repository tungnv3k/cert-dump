import mongoose from "mongoose";

import { withDb, methodNotAllowed } from "./handler.js";

function pickPayload(item) {
  return {
    title: item?.title,
    description: item?.description || "",
    questions: Array.isArray(item?.questions)
      ? item.questions.map((question) => ({
          question: question?.question,
          options: question?.options,
          correctAnswers: question?.correctAnswers,
          multiple: Boolean(question?.multiple),
          explanation: question?.explanation || "",
        }))
      : [],
  };
}

export function createCollectionIndexHandler(Model, { allowBulkCreate = false } = {}) {
  return withDb(async (req, res) => {
    if (req.method === "GET") {
      const docs = await Model.find().sort({ createdAt: 1 });
      res.status(200).json(docs);
      return;
    }

    if (req.method === "POST") {
      const isBulk = allowBulkCreate && Array.isArray(req.body);
      const items = isBulk ? req.body : [req.body];

      if (!items.length) {
        res.status(400).json({ error: "No data provided." });
        return;
      }

      try {
        const created = await Model.insertMany(items.map(pickPayload), {
          ordered: true,
        });
        res.status(201).json(isBulk ? created : created[0]);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
      return;
    }

    methodNotAllowed(res, ["GET", "POST"]);
  });
}

export function createCollectionItemHandler(Model) {
  return withDb(async (req, res) => {
    const { id } = req.query;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ error: "Invalid id." });
      return;
    }

    if (req.method === "DELETE") {
      const deleted = await Model.findByIdAndDelete(id);
      if (!deleted) {
        res.status(404).json({ error: "Not found." });
        return;
      }
      res.status(204).end();
      return;
    }

    if (req.method === "GET") {
      const doc = await Model.findById(id);
      if (!doc) {
        res.status(404).json({ error: "Not found." });
        return;
      }
      res.status(200).json(doc);
      return;
    }

    methodNotAllowed(res, ["GET", "DELETE"]);
  });
}
