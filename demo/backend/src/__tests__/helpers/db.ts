import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mem: MongoMemoryServer | null = null;

export async function startTestDb(): Promise<void> {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
}

export async function stopTestDb(): Promise<void> {
  await mongoose.disconnect();
  if (mem) {
    await mem.stop();
    mem = null;
  }
}

export async function clearDb(): Promise<void> {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}
