import moment from "moment-timezone";
import EventGroup from "../models/EventGroup.js";
import Event from "../models/Event.js";
import { generateEditToken, generateEventID } from "../util/generator.js";
import type { IRecurrenceRule } from "../models/EventGroup.js";

const LOOKAHEAD_DAYS = 90;

/**
 * Returns the moment for the nth occurrence of a weekday in a given month.
 * nth = 1–4 for first–fourth; nth = -1 for last.
 */
function nthWeekdayOfMonth(
  year: number,
  month: number, // 0-based
  dayOfWeek: number, // 0=Sun
  nth: number,
): moment.Moment | null {
  if (nth === -1) {
    // Last occurrence: start from end of month and walk back
    const last = moment.tz({ year, month }, "UTC").endOf("month").startOf("day");
    while (last.day() !== dayOfWeek) last.subtract(1, "day");
    return last;
  }
  // Find the first occurrence then advance by (nth-1) weeks
  const first = moment.tz({ year, month, date: 1 }, "UTC");
  const diff = (dayOfWeek - first.day() + 7) % 7;
  first.add(diff, "days");
  first.add((nth - 1) * 7, "days");
  // Verify it's still in the same month
  if (first.month() !== month) return null;
  return first;
}

/**
 * Computes all occurrence start times within [from, until) for a given rule.
 * Returns moment objects in the rule's timezone.
 */
export function computeOccurrences(
  rule: IRecurrenceRule,
  from: moment.Moment,
  until: moment.Moment,
): moment.Moment[] {
  const [hours, minutes] = rule.time.split(":").map(Number);
  const occurrences: moment.Moment[] = [];

  // Start from the first candidate on or after `from`
  let cursor = from.clone().tz(rule.timezone).startOf("day");

  while (cursor.isBefore(until)) {
    let candidate: moment.Moment | null = null;

    if (rule.frequency === "weekly" || rule.frequency === "biweekly") {
      if (cursor.day() === rule.dayOfWeek) {
        candidate = cursor.clone().hour(hours).minute(minutes).second(0).millisecond(0);
      }
    } else if (rule.frequency === "monthly") {
      if (!rule.monthlyType || rule.monthlyType === "day-of-month") {
        const lastDayOfMonth = cursor.clone().endOf("month").date();
        const targetDay = Math.min(rule.dayOfMonth ?? 1, lastDayOfMonth);
        if (cursor.date() === targetDay) {
          candidate = cursor.clone().hour(hours).minute(minutes).second(0).millisecond(0);
        }
      } else {
        // nth-weekday: only evaluate on the first day of each month
        if (cursor.date() === 1) {
          const resolved = nthWeekdayOfMonth(cursor.year(), cursor.month(), rule.dayOfWeek ?? 0, rule.nth ?? 1);
          if (resolved) {
            candidate = resolved.clone().hour(hours).minute(minutes).second(0).millisecond(0);
          }
        }
      }
    }

    if (candidate && candidate.isSameOrAfter(from) && candidate.isBefore(until)) {
      occurrences.push(candidate);
    }

    // Advance cursor
    if (rule.frequency === "monthly" && rule.monthlyType === "nth-weekday" && cursor.date() === 1) {
      // Jump to first of next month
      cursor.add(1, "month");
    } else if (rule.frequency === "biweekly" && cursor.day() === rule.dayOfWeek) {
      cursor.add(2, "weeks");
    } else {
      cursor.add(1, "day");
    }
  }

  return occurrences;
}

/**
 * For each EventGroup with recurrence enabled, creates Event documents for
 * any occurrences in the next LOOKAHEAD_DAYS that don't already exist.
 */
export async function generateRecurringEvents(): Promise<void> {
  const now = moment();
  const until = now.clone().add(LOOKAHEAD_DAYS, "days");

  // --- Group-level recurrence (legacy) ---
  const groups = await EventGroup.find({ "recurrence.enabled": true }).populate("events");

  for (const group of groups) {
    const rule = group.recurrence;
    if (!rule) continue;

    const occurrences = computeOccurrences(rule, now, until);
    try {

    const existingEvents = await Event.find({
      eventGroup: group._id,
      start: { $gte: now.toDate(), $lt: until.toDate() },
    }).select("start");

    const existingStarts = new Set(
      existingEvents.map((e) => moment(e.start).tz(rule.timezone).toISOString()),
    );

    for (const start of occurrences) {
      if (existingStarts.has(start.toISOString())) continue;

      const end = start.clone().add(rule.durationMinutes, "minutes");
      const eventID = generateEventID();
      const editToken = generateEditToken();

      const event = new Event({
        id: eventID,
        type: "public",
        name: group.name,
        location: "TBD",
        start: start.toDate(),
        end: end.toDate(),
        timezone: rule.timezone,
        description: group.description,
        image: group.image,
        url: group.url,
        creatorEmail: group.creatorEmail,
        hostName: group.hostName,
        editToken,
        eventGroup: group._id,
        usersCanAttend: true,
        showUsersList: false,
        usersCanComment: true,
        firstLoad: false,
        showOnPublicList: group.showOnPublicList,
      });

      await event.save();

      await EventGroup.findByIdAndUpdate(group._id, {
        $push: { events: event._id },
      });
    }
    } catch (err) {
      console.error(`Recurrence generation failed for group ${group.id}:`, err);
    }
  }

  // --- Event-level recurrence (new) ---
  const templates = await Event.find({ recurrenceTemplate: true }).lean();

  for (const template of templates) {
    const rule = template.recurrence;
    if (!rule?.enabled) continue;

    const occurrences = computeOccurrences(rule, now, until);
    try {

    const existingInstances = await Event.find({
      recurrenceId: template.id,
      start: { $gte: now.toDate(), $lt: until.toDate() },
    }).select("start");

    const existingStarts = new Set(
      existingInstances.map((e) => moment(e.start).tz(rule.timezone).toISOString()),
    );
    // The template event IS the first occurrence — never duplicate it
    existingStarts.add(moment(template.start).tz(rule.timezone).toISOString());

    for (const start of occurrences) {
      if (existingStarts.has(start.toISOString())) continue;

      const end = start.clone().add(rule.durationMinutes, "minutes");
      const eventID = generateEventID();

      const instance = new Event({
        id: eventID,
        type: "public",
        name: template.name,
        location: template.location ?? "",
        start: start.toDate(),
        end: end.toDate(),
        timezone: rule.timezone,
        description: template.description,
        image: template.image,
        url: template.url,
        creatorEmail: template.creatorEmail,
        hostName: template.hostName,
        editToken: template.editToken,
        eventGroup: template.eventGroup,
        usersCanAttend: template.usersCanAttend,
        showUsersList: template.showUsersList,
        usersCanComment: template.usersCanComment,
        showOnPublicList: template.showOnPublicList,
        approveRegistrations: template.approveRegistrations,
        maxAttendees: template.maxAttendees,
        firstLoad: false,
        recurrenceTemplate: false,
        recurrenceId: template.id,
      });

      await instance.save();
    }
    } catch (err) {
      console.error(`Recurrence generation failed for event template ${template.id}:`, err);
    }
  }
}
