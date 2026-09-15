import mongoose from "mongoose";

import { ensureSeedData } from "./seed-data.js";

const globalForMongoose = globalThis;

let cached = globalForMongoose._mongooseConnection;
if (!cached) {
  cached = globalForMongoose._mongooseConnection = {
    conn: null,
    promise: null,
    seeded: false,
  };
}

export async function connectToDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "Missing MONGODB_URI environment variable. Set it in your Vercel project settings (and in .env for local development).",
    );
  }

  if (!cached.conn) {
    if (!cached.promise) {
      cached.promise = mongoose
        .connect(uri, { bufferCommands: false })
        .then((instance) => instance);
    }

    try {
      cached.conn = await cached.promise;
    } catch (error) {
      cached.promise = null;
      throw error;
    }
  }

  if (!cached.seeded) {
    cached.seeded = true;
    // Runs once per cold start; failures here shouldn't break real requests.
    try {
      await ensureSeedData();
    } catch (error) {
      cached.seeded = false;
      console.error("Seed check failed:", error.message);
    }
  }

  return cached.conn;
}
