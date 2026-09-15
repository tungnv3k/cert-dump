import { connectToDatabase } from "./db.js";

export function withDb(fn) {
  return async function handler(req, res) {
    try {
      await connectToDatabase();
    } catch (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    try {
      await fn(req, res);
    } catch (error) {
      res.status(500).json({ error: error.message || "Unexpected server error." });
    }
  };
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  res.status(405).json({ error: `Method not allowed. Use ${allowed.join(", ")}.` });
}
