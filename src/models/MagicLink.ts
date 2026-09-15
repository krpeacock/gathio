import mongoose from "mongoose";

export type MagicLinkAction = "createEvent" | "editAnyEvent" | "editGranted";

export interface MagicLink {
  id: string;
  email: string;
  token: string;
  expiryTime: Date;
  permittedActions: MagicLinkAction[];
  scope: {
    eventIds: string[];
    groupIds: string[];
  };
}

const MagicLinkSchema = new mongoose.Schema({
  email: {
    type: String,
    trim: true,
    required: true,
  },
  token: {
    type: String,
    trim: true,
    required: true,
  },
  expiryTime: {
    type: Date,
    trim: true,
    required: true,
  },
  permittedActions: {
    type: [String],
    required: true,
  },
  // Scopes an "editGranted" session to specific events/groups. Empty arrays
  // (the default) mean the link covers nothing; older documents without a
  // scope field behave the same way.
  scope: {
    eventIds: {
      type: [String],
      default: [],
    },
    groupIds: {
      type: [String],
      default: [],
    },
  },
});

export default mongoose.model<MagicLink>("MagicLink", MagicLinkSchema);
