import mongoose from "mongoose";
import { env } from "./env";

let memoryServer: { stop: () => Promise<unknown> } | null = null;

/**
 * Connect to MongoDB.
 *  - If MONGO_URI is set, use it.
 *  - Otherwise boot an ephemeral in-memory MongoDB so the lab runs with zero setup.
 */
export async function connectDb(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  let uri = env.mongoUri;

  if (!uri) {
    // Lazy import so production installs can prune mongodb-memory-server if desired.
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const mem = await MongoMemoryServer.create();
    memoryServer = mem;
    uri = mem.getUri();
    // eslint-disable-next-line no-console
    console.log(`[db] in-memory MongoDB at ${uri}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[db] connecting to ${uri}`);
  }

  await mongoose.connect(uri);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
