import mongoose, { Schema, type Model, type HydratedDocument, type Types } from "mongoose";

/**
 * Server-side session records. Used ONLY by the hardened stack.
 *
 * Each issued token pair has a `jti`; the hardened `authenticate` middleware and
 * refresh endpoint check that the jti still exists and is `active`. Logout marks
 * it `revoked`; logout-all / password change revokes every row for the user.
 *
 * The baseline stack issues bare JWTs with no server record, so it has nothing to
 * revoke — that is the point of the "broken logout" finding.
 */
export interface ISession {
  userId: Types.ObjectId;
  jti: string;
  status: "active" | "revoked";
  userAgent: string;
  ip: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jti: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ["active", "revoked"], default: "active", index: true },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
  },
  { timestamps: true },
);

export type SessionDoc = HydratedDocument<ISession>;

export const Session: Model<ISession> =
  (mongoose.models.Session as Model<ISession>) ||
  mongoose.model<ISession>("Session", sessionSchema);
