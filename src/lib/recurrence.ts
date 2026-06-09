import moment from "moment-timezone";
import EventGroup from "../models/EventGroup.js";
import Event from "../models/Event.js";
import { generateEditToken, generateEventID } from "../util/generator.js";
import type { IEventGroup, IRecurrenceRule } from "../models/EventGroup.js";

const LOOKAHEAD_DAYS = 90;
const MAX_OCCURRENCES = 5000; // safety bound on series expansion

// MongoDB duplicate-key error code; surfaces when two concurrent upserts race
// to insert the same (recurrenceId, occurrenceKey).
const DUPLICATE_KEY_ERROR = 11000;

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
    const last = moment
      .tz({ year, month }, "UTC")
      .endOf("month")
      .startOf("day");
    while (last.day() !== dayOfWeek) last.subtract(1, "day");
    return last;
  }
  const first = moment.tz({ year, month, date: 1 }, "UTC");
  const diff = (dayOfWeek - first.day() + 7) % 7;
  first.add(diff, "days");
  first.add((nth - 1) * 7, "days");
  if (first.month() !== month) return null;
  return first;
}

function applyTimeOfDay(
  m: moment.Moment,
  hours: number,
  minutes: number,
  tz: string,
): moment.Moment {
  return moment.tz(
    {
      year: m.year(),
      month: m.month(),
      date: m.date(),
      hour: hours,
      minute: minutes,
      second: 0,
      millisecond: 0,
    },
    tz,
  );
}

/**
 * Resolves the canonical first occurrence ("anchor") of a series. If the rule
 * already carries an `anchorDate`, that is the anchor verbatim. Otherwise we
 * derive a stable seed from the rule itself so that subsequent stepping is
 * deterministic — never from `now`.
 */
function resolveAnchor(rule: IRecurrenceRule): moment.Moment {
  const [hours, minutes] = rule.time.split(":").map(Number);
  const tz = rule.timezone;

  if (rule.anchorDate) {
    return moment.tz(rule.anchorDate, tz);
  }

  // No stored anchor — synthesize one. We pick a reference date in the rule's
  // timezone and project it onto the first valid occurrence. Using a fixed
  // epoch reference (rather than `now`) keeps biweekly parity deterministic
  // even across rule loads on different days.
  const reference = moment.tz("2024-01-01T00:00:00", tz);

  if (rule.frequency === "weekly" || rule.frequency === "biweekly") {
    const dayOfWeek = rule.dayOfWeek ?? 0;
    const diff = (dayOfWeek - reference.day() + 7) % 7;
    const seed = reference.clone().add(diff, "days");
    return applyTimeOfDay(seed, hours, minutes, tz);
  }

  if (rule.frequency === "monthly") {
    if (!rule.monthlyType || rule.monthlyType === "day-of-month") {
      const dayOfMonth = rule.dayOfMonth ?? 1;
      const lastDay = reference.clone().endOf("month").date();
      const seed = reference.clone().date(Math.min(dayOfMonth, lastDay));
      return applyTimeOfDay(seed, hours, minutes, tz);
    }
    // nth-weekday
    const resolved = nthWeekdayOfMonth(
      reference.year(),
      reference.month(),
      rule.dayOfWeek ?? 0,
      rule.nth ?? 1,
    );
    if (resolved) {
      return applyTimeOfDay(resolved, hours, minutes, tz);
    }
  }

  // Fallback — shouldn't be reached for known frequencies.
  return applyTimeOfDay(reference, hours, minutes, tz);
}

/**
 * Computes all occurrence start times within [from, until) for a given rule.
 * Stepping is performed in fixed-size units from the canonical anchor (not
 * from `from`), so the resulting UTC instants are independent of when this
 * function runs. This is what makes "every other Tuesday" land on the same
 * Tuesdays whether you generate today or next week.
 */
export function computeOccurrences(
  rule: IRecurrenceRule,
  from: moment.Moment,
  until: moment.Moment,
): moment.Moment[] {
  const [hours, minutes] = rule.time.split(":").map(Number);
  const tz = rule.timezone;
  const anchor = resolveAnchor(rule);
  const occurrences: moment.Moment[] = [];

  if (rule.frequency === "weekly" || rule.frequency === "biweekly") {
    const stepWeeks = rule.frequency === "biweekly" ? 2 : 1;
    for (let n = 0; n < MAX_OCCURRENCES; n++) {
      const candidate = anchor.clone().add(n * stepWeeks, "weeks");
      if (candidate.isSameOrAfter(until)) break;
      if (candidate.isSameOrAfter(from)) occurrences.push(candidate);
    }
    return occurrences;
  }

  if (rule.frequency === "monthly") {
    if (!rule.monthlyType || rule.monthlyType === "day-of-month") {
      const dayOfMonth = rule.dayOfMonth ?? 1;
      for (let n = 0; n < MAX_OCCURRENCES; n++) {
        // moment's add(n, "months") clamps day-of-month to month length while
        // preserving the original calendar day for subsequent steps, which is
        // exactly the "every month on the Xth, clamped" semantic we want.
        const stepped = anchor.clone().add(n, "months");
        // Re-apply explicit dayOfMonth clamping in case the anchor's calendar
        // day differs from the rule (e.g. anchor was set from a different
        // dayOfMonth before the rule was edited).
        const lastDay = stepped.clone().endOf("month").date();
        const candidate = applyTimeOfDay(
          stepped.clone().date(Math.min(dayOfMonth, lastDay)),
          hours,
          minutes,
          tz,
        );
        if (candidate.isSameOrAfter(until)) break;
        if (candidate.isSameOrAfter(from)) occurrences.push(candidate);
      }
      return occurrences;
    }
    // nth-weekday
    const dayOfWeek = rule.dayOfWeek ?? 0;
    const nth = rule.nth ?? 1;
    const monthCursor = anchor.clone().startOf("month");
    for (let n = 0; n < MAX_OCCURRENCES; n++) {
      const month = monthCursor.clone().add(n, "months");
      const resolved = nthWeekdayOfMonth(
        month.year(),
        month.month(),
        dayOfWeek,
        nth,
      );
      if (!resolved) continue;
      const candidate = applyTimeOfDay(resolved, hours, minutes, tz);
      if (candidate.isSameOrAfter(until)) break;
      if (candidate.isSameOrAfter(from)) occurrences.push(candidate);
    }
    return occurrences;
  }

  return occurrences;
}

/**
 * Stable per-occurrence key. Using the canonical UTC instant means repeated
 * generations of the same rule always produce the same key, so the unique
 * compound index `(recurrenceId, occurrenceKey)` collapses duplicates from
 * concurrent or repeated runs.
 */
export function occurrenceKey(start: moment.Moment | Date): string {
  return moment(start).toISOString();
}

interface UpsertOccurrenceArgs {
  recurrenceId: string;
  start: moment.Moment;
  payload: Record<string, unknown>;
}

/**
 * Idempotent insert of a single occurrence. The `(recurrenceId, occurrenceKey)`
 * unique index guarantees at most one document per occurrence; concurrent
 * racers see a duplicate-key error which we swallow.
 */
async function upsertOccurrence({
  recurrenceId,
  start,
  payload,
}: UpsertOccurrenceArgs): Promise<void> {
  const key = occurrenceKey(start);
  try {
    await Event.updateOne(
      { recurrenceId, occurrenceKey: key },
      {
        $setOnInsert: {
          ...payload,
          recurrenceId,
          occurrenceKey: key,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: number }).code === DUPLICATE_KEY_ERROR
    ) {
      // Another runner inserted this occurrence first — that's the win
      // condition, not a failure.
      return;
    }
    throw err;
  }
}

/**
 * Backfill `recurrenceId` and `occurrenceKey` on legacy group-generated events
 * so they participate in the unique-index dedup going forward. One-shot per
 * group: subsequent calls find nothing to update.
 */
async function backfillGroupRecurrenceMetadata(
  group: IEventGroup,
  groupRecurrenceId: string,
): Promise<void> {
  const legacyEvents = await Event.find({
    eventGroup: group._id,
    recurrenceTemplate: { $ne: true },
    $or: [
      { recurrenceId: { $exists: false } },
      { recurrenceId: null },
      { occurrenceKey: { $exists: false } },
      { occurrenceKey: null },
    ],
  } as Parameters<typeof Event.find>[0]).select("_id start");

  for (const e of legacyEvents) {
    try {
      await Event.updateOne(
        { _id: e._id },
        {
          $set: {
            recurrenceId: groupRecurrenceId,
            occurrenceKey: occurrenceKey(e.start),
          },
        },
      );
    } catch (err: unknown) {
      // If two legacy events collided on the same start (pre-existing
      // duplicates from the old bug), the unique index will reject one of the
      // backfills. Leave it: a follow-up dedup migration must remove the
      // duplicate before the index can fully apply.
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: number }).code === DUPLICATE_KEY_ERROR
      ) {
        console.warn(
          `Pre-existing duplicate occurrence in group ${group.id} for start ${moment(
            e.start,
          ).toISOString()}; manual dedup required.`,
        );
        continue;
      }
      throw err;
    }
  }
}

/**
 * Synthesizes the recurrenceId used by legacy group-level recurrence so it
 * shares the same unique-index machinery as event-level templates.
 */
function groupRecurrenceIdFor(group: IEventGroup): string {
  return `group:${group._id.toString()}`;
}

/**
 * Ensures the rule has an `anchorDate`, computing one if missing. Returns the
 * resolved anchor moment so callers can both persist and reuse it.
 */
function ensureAnchor(rule: IRecurrenceRule): moment.Moment {
  if (rule.anchorDate) {
    return moment.tz(rule.anchorDate, rule.timezone);
  }
  const anchor = resolveAnchor(rule);
  rule.anchorDate = anchor.toDate();
  return anchor;
}

/**
 * For each EventGroup with recurrence enabled, creates Event documents for
 * any occurrences in the next LOOKAHEAD_DAYS that don't already exist.
 *
 * Safe to call concurrently and repeatedly: each occurrence is upserted on the
 * `(recurrenceId, occurrenceKey)` unique index, so overlapping runs collapse
 * to a single document per occurrence.
 */
export async function generateRecurringEvents(): Promise<void> {
  const now = moment();
  const until = now.clone().add(LOOKAHEAD_DAYS, "days");

  // --- Group-level recurrence (legacy) ---
  const groups = await EventGroup.find({ "recurrence.enabled": true });

  for (const group of groups) {
    const rule = group.recurrence;
    if (!rule) continue;

    // Defer to the event-level template system if one exists for this group.
    const hasTemplate = await Event.exists({
      eventGroup: group._id,
      recurrenceTemplate: true,
    });
    if (hasTemplate) continue;

    try {
      const groupRecurrenceId = groupRecurrenceIdFor(group);
      await backfillGroupRecurrenceMetadata(group, groupRecurrenceId);

      // Persist the anchor on first generation so future runs (and edits) are
      // anchored to the same canonical first occurrence.
      const anchorWasMissing = !rule.anchorDate;
      ensureAnchor(rule);
      if (anchorWasMissing) {
        await EventGroup.updateOne(
          { _id: group._id },
          { $set: { "recurrence.anchorDate": rule.anchorDate } },
        );
      }

      const occurrences = computeOccurrences(rule, now, until);
      const excludedStarts = new Set(
        (group.excludedDates ?? []).map((d) => moment(d).toISOString()),
      );

      for (const start of occurrences) {
        if (excludedStarts.has(start.toISOString())) continue;

        const end = start.clone().add(rule.durationMinutes, "minutes");
        const eventID = generateEventID();
        const editToken = generateEditToken();

        await upsertOccurrence({
          recurrenceId: groupRecurrenceId,
          start,
          payload: {
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
          },
        });

        // The upsert above is idempotent; only push the new event onto the
        // group when we actually inserted one. Fetch by the unique key to
        // discover the doc and link if not already linked.
        const inserted = await Event.findOne({
          recurrenceId: groupRecurrenceId,
          occurrenceKey: occurrenceKey(start),
        }).select("_id");
        if (inserted) {
          await EventGroup.updateOne(
            { _id: group._id, events: { $ne: inserted._id } },
            { $push: { events: inserted._id } },
          );
        }
      }
    } catch (err) {
      console.error(`Recurrence generation failed for group ${group.id}:`, err);
    }
  }

  // --- Event-level recurrence ---
  const templates = await Event.find({ recurrenceTemplate: true });

  for (const template of templates) {
    const rule = template.recurrence;
    if (!rule?.enabled) continue;

    try {
      // Persist the anchor on the template itself so subsequent runs are
      // deterministic across the rule's lifetime.
      const anchorWasMissing = !rule.anchorDate;
      if (anchorWasMissing) {
        rule.anchorDate = template.start;
      }

      // Tag the template doc as the first occurrence of its own series so
      // the unique compound index covers it too.
      const templateKey = occurrenceKey(template.start);
      const templateNeedsTagging =
        !template.occurrenceKey || template.occurrenceKey !== templateKey;
      if (templateNeedsTagging || anchorWasMissing) {
        await Event.updateOne(
          { _id: template._id },
          {
            $set: {
              occurrenceKey: templateKey,
              recurrenceId: template.id,
              "recurrence.anchorDate": rule.anchorDate,
            },
          },
        );
      }

      const occurrences = computeOccurrences(rule, now, until);
      const excludedStarts = new Set(
        (template.recurrenceExcludedDates ?? []).map((d) =>
          moment(d).toISOString(),
        ),
      );

      for (const start of occurrences) {
        if (excludedStarts.has(start.toISOString())) continue;
        // The template covers its own occurrence — skip it explicitly so we
        // don't even attempt an upsert (the unique index would catch it
        // anyway, but skipping avoids the round trip).
        if (start.toISOString() === templateKey) continue;

        const end = start.clone().add(rule.durationMinutes, "minutes");
        const eventID = generateEventID();

        await upsertOccurrence({
          recurrenceId: template.id,
          start,
          payload: {
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
          },
        });
      }
    } catch (err) {
      console.error(
        `Recurrence generation failed for event template ${template.id}:`,
        err,
      );
    }
  }
}

/**
 * Clears future auto-generated, attendee-free instances of a series so the
 * caller can regenerate them against an updated rule. Preserves the template
 * itself and any occurrence with attendees or comments — those represent
 * user-visible state that shouldn't silently disappear when a rule is edited.
 */
export async function clearFutureAutoGeneratedInstances(
  recurrenceId: string,
): Promise<void> {
  const now = new Date();
  await Event.deleteMany({
    recurrenceId,
    recurrenceTemplate: { $ne: true },
    start: { $gt: now },
    $and: [
      {
        $or: [{ attendees: { $exists: false } }, { attendees: { $size: 0 } }],
      },
      {
        $or: [{ comments: { $exists: false } }, { comments: { $size: 0 } }],
      },
    ],
  });
}
