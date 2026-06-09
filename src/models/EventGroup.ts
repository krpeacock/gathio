import mongoose from "mongoose";

export interface ISubscriber {
  email?: string;
}

export type RecurrenceFrequency = "weekly" | "biweekly" | "monthly";

export type MonthlyType = "day-of-month" | "nth-weekday";

export interface IRecurrenceRule {
  enabled: boolean;
  frequency: RecurrenceFrequency;
  // weekly / biweekly
  dayOfWeek?: number; // 0–6
  // monthly: fixed day (e.g. the 15th)
  monthlyType?: MonthlyType;
  dayOfMonth?: number; // 1–31, used when monthlyType === 'day-of-month'
  // monthly: nth weekday (e.g. "first Tuesday", "last Friday")
  nth?: number; // 1–4 or -1 for last
  time: string; // 'HH:MM' in the group's timezone
  timezone: string; // IANA tz string e.g. 'America/Los_Angeles'
  durationMinutes: number;
  // Canonical first occurrence — all subsequent occurrences are arithmetic offsets
  // from this anchor. Stored as UTC. Makes biweekly/monthly stepping independent
  // of when generation runs.
  anchorDate?: Date;
}

export interface IEventGroup extends mongoose.Document {
  id: string;
  name: string;
  description: string;
  image?: string;
  url?: string;
  creatorEmail?: string;
  hostName?: string;
  editToken?: string;
  firstLoad?: boolean;
  events?: mongoose.Types.ObjectId[];
  subscribers?: ISubscriber[];
  showOnPublicList?: boolean;
  recurrence?: IRecurrenceRule;
  excludedDates?: Date[];
}

const Subscriber = new mongoose.Schema({
  email: {
    type: String,
    trim: true,
  },
});

const EventGroupSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    trim: true,
    required: true,
  },
  description: {
    type: String,
    trim: true,
    required: true,
  },
  image: {
    type: String,
    trim: true,
  },
  url: {
    type: String,
    trim: true,
  },
  creatorEmail: {
    type: String,
    trim: true,
  },
  hostName: {
    type: String,
    trim: true,
  },
  editToken: {
    type: String,
    trim: true,
    minlength: 32,
    maxlength: 32,
  },
  firstLoad: {
    type: Boolean,
    trim: true,
    default: true,
  },
  events: [{ type: mongoose.Schema.Types.ObjectId, ref: "Event" }],
  subscribers: [Subscriber],
  showOnPublicList: {
    type: Boolean,
    default: false,
  },
  excludedDates: [{ type: Date }],
  recurrence: {
    type: new mongoose.Schema(
      {
        enabled: { type: Boolean, required: true, default: false },
        frequency: {
          type: String,
          enum: ["weekly", "biweekly", "monthly"],
          required: true,
        },
        dayOfWeek: { type: Number, min: 0, max: 6 },
        monthlyType: { type: String, enum: ["day-of-month", "nth-weekday"] },
        dayOfMonth: { type: Number, min: 1, max: 31 },
        nth: { type: Number },
        time: { type: String, required: true },
        timezone: { type: String, required: true },
        durationMinutes: { type: Number, required: true },
        anchorDate: { type: Date },
      },
      { _id: false },
    ),
    required: false,
  },
});

export default mongoose.model<IEventGroup>("EventGroup", EventGroupSchema);
