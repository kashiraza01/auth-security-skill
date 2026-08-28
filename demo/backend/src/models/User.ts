import mongoose, { Schema, type Model, type HydratedDocument } from "mongoose";

/**
 * One user collection is shared by both stacks. The difference is entirely in how
 * the controllers treat the fields:
 *
 *  - `role` / `permissions` are written at registration. The BASELINE register
 *    endpoint lets the client choose them. The HARDENED one ignores client input
 *    and always assigns role "user".
 *  - `hashAlgo` records which hasher produced `passwordHash` ("bcrypt" | "argon2").
 *  - `tokenVersion` is bumped by the HARDENED stack on logout-all / password
 *    change to invalidate every previously issued token. The BASELINE stack never
 *    touches it.
 */
export interface IUser {
  email: string;
  passwordHash: string;
  hashAlgo: "bcrypt" | "argon2";
  role: "user" | "admin";
  permissions: string[];
  tokenVersion: number;
  createdVia: "baseline" | "hardened" | "seed";
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    hashAlgo: { type: String, enum: ["bcrypt", "argon2"], required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    permissions: { type: [String], default: [] },
    tokenVersion: { type: Number, default: 0 },
    createdVia: { type: String, enum: ["baseline", "hardened", "seed"], required: true },
  },
  { timestamps: true },
);

export type UserDoc = HydratedDocument<IUser>;

export const User: Model<IUser> =
  (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>("User", userSchema);
