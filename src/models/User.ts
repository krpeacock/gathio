import mongoose from "mongoose";

export interface User extends mongoose.Document {
  id: string;
  email: string;
  grants: { kind: "event" | "group"; refId: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      required: true,
      unique: true,
      index: true,
    },
    // Passkey login grants: which events/groups this user may edit after
    // signing in with a passkey (in addition to any admin access).
    grants: {
      type: [
        {
          kind: {
            type: String,
            enum: ["event", "group"],
            required: true,
          },
          refId: {
            type: String,
            required: true,
          },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<User>("User", UserSchema);
