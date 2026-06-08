import moment from "moment-timezone";
import EventGroup from "../models/EventGroup.js";
import Event from "../models/Event.js";
import { generateEditToken, generateEventID } from "../util/generator.js";
import type { IRecurrenceRule } from "../models/EventGroup.js";

const LOOKAHEAD_DAYS = 90;

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
      const lastDayOfMonth = cursor.clone().endOf("month").date();
      const targetDay = Math.min(rule.dayOfMonth ?? 1, lastDayOfMonth);
      if (cursor.date() === targetDay) {
        candidate = cursor.clone().hour(hours).minute(minutes).second(0).millisecond(0);
      }
    }

    if (candidate && candidate.isSameOrAfter(from) && candidate.isBefore(until)) {
      occurrences.push(candidate);
    }

    // Advance cursor
    if (rule.frequency === "biweekly" && cursor.day() === rule.dayOfWeek) {
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
  const groups = await EventGroup.find({ "recurrence.enabled": true }).populate(
    "events",
  );

  const now = moment();
  const until = now.clone().add(LOOKAHEAD_DAYS, "days");

  for (const group of groups) {
    const rule = group.recurrence;
    if (!rule) continue;

    const occurrences = computeOccurrences(rule, now, until);

    // Fetch existing events in this group so we can skip already-created ones
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
        name: group.name,
        location: "",
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
  }
}
