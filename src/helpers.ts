import moment from "moment-timezone";
import icalGenerator from "ical-generator";
import type { RepeatingData, day as ICalDay } from "ical-generator";
import i18next from "i18next";
import handlebars from "handlebars";
import Log from "./models/Log.js";
import type { IRecurrenceRule } from "./models/EventGroup.js";
import { getConfig } from "./lib/config.js";

const config = getConfig();
const domain = config.general.domain;
const siteName = config.general.site_name;

// LOGGING
export async function addToLog(
  process: string,
  status: string,
  message: string,
) {
  const logEntry = {
    status,
    process,
    message,
    timestamp: new Date(),
  };

  try {
    await new Log(logEntry).save();
  } catch (err) {
    console.log("Error saving log entry!", err);
  }
}

// Minimal event shape for iCal export (works with both documents and lean objects)
export interface ICalEvent {
  id: string;
  name: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  timezone: string;
  hostName?: string;
  creatorEmail?: string;
  recurrence?: IRecurrenceRule;
  recurrenceTemplate?: boolean;
}

const RRULE_DAYS: ICalDay[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Translate our recurrence rule into an RFC 5545 RRULE body (no "RRULE:"
// prefix), e.g. "FREQ=MONTHLY;BYDAY=1FR". Used for the Google Calendar
// link. Returns null for disabled or unrecognised rules.
export function recurrenceToRRule(rule?: IRecurrenceRule): string | null {
  if (!rule?.enabled) return null;
  const day = RRULE_DAYS[rule.dayOfWeek ?? 0];
  switch (rule.frequency) {
    case "weekly":
      return `FREQ=WEEKLY;BYDAY=${day}`;
    case "biweekly":
      return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${day}`;
    case "monthly":
      return rule.monthlyType === "nth-weekday"
        ? `FREQ=MONTHLY;BYDAY=${rule.nth}${day}`
        : `FREQ=MONTHLY;BYMONTHDAY=${rule.dayOfMonth}`;
    default:
      return null;
  }
}

// The same rule shaped for ical-generator's `repeating` option. The
// nth-weekday case uses byDay + bySetPos (e.g. BYDAY=FR;BYSETPOS=1)
// rather than a prefixed "1FR", since the library types byDay as bare
// weekday codes.
export function recurrenceToICalRepeating(
  rule?: IRecurrenceRule,
): RepeatingData | null {
  if (!rule?.enabled) return null;
  const day = RRULE_DAYS[rule.dayOfWeek ?? 0];
  switch (rule.frequency) {
    case "weekly":
      return { freq: "WEEKLY", byDay: [day] };
    case "biweekly":
      return { freq: "WEEKLY", interval: 2, byDay: [day] };
    case "monthly":
      return rule.monthlyType === "nth-weekday"
        ? { freq: "MONTHLY", byDay: [day], bySetPos: rule.nth ?? 1 }
        : { freq: "MONTHLY", byMonthDay: [rule.dayOfMonth ?? 1] };
    default:
      return null;
  }
}

export function exportIcal(
  events: ICalEvent | ICalEvent[],
  calendarName?: string,
  // When true, a recurrence-template event is exported as a single
  // repeating VEVENT (RRULE) rather than just its first occurrence. Keep
  // this off for the group feed, which already lists the materialized
  // instances — turning it on there would double-book the series.
  options?: { expandRecurringTemplates?: boolean },
) {
  // Ical -> ICal
  // Create a new icalGenerator... generator
  const cal = icalGenerator({
    name: calendarName || siteName,
    timezone: "UTC",
  });

  const eventArray = Array.isArray(events) ? events : [events];
  eventArray.forEach((event) => {
    const iCalEvent = cal.createEvent({
      start: moment.tz(event.start, event.timezone),
      end: moment.tz(event.end, event.timezone),
      timezone: event.timezone,
      summary: event.name,
      uid: "@" + event.id + "@" + domain,
      description: event.description,
      organizer: {
        name: event.hostName || "Anonymous",
        email: event.creatorEmail || "anonymous@anonymous.com",
      },
      location: event.location,
      url: "https://" + domain + "/" + event.id,
    });

    if (options?.expandRecurringTemplates && event.recurrenceTemplate) {
      const repeating = recurrenceToICalRepeating(event.recurrence);
      if (repeating) {
        iCalEvent.repeating(repeating);
      }
    }
  });

  return cal.toString();
}

interface I18nHelpers {
  t: (key: string, options?: object) => string;
  tn: (key: string, options?: object) => string;
  count?: number;
}

export function getI18nHelpers(): I18nHelpers {
  return {
    t: function (key: string, options?: object) {
      const translation = i18next.t(key, { ...this, ...options });
      const template = handlebars.compile(translation);
      return template(this);
    },
    tn: function (key: string, options?: object) {
      const translation = i18next.t(key, {
        count: this.count,
        ...options,
      });
      const template = handlebars.compile(translation);
      return template(this);
    },
  };
}
