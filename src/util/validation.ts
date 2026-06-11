import i18next from "i18next";
import moment from "moment-timezone";
import type { IRecurrenceRule } from "../models/EventGroup.js";

type Error = {
  message?: string;
  field?: string;
};

type EventValidationResponse = {
  data?: ValidatedEventData;
  errors?: Error[];
};

type EventGroupValidationResponse = {
  data?: ValidatedEventGroupData;
  errors?: Error[];
};

interface EventData {
  eventName: string;
  eventLocation: string;
  eventStart: string;
  eventEnd: string;
  timezone: string;
  eventDescription: string;
  eventURL: string;
  imagePath: string;
  hostName: string;
  creatorEmail: string;
  publicCheckbox: string;
  eventGroupCheckbox: string;
  eventGroupID: string;
  eventGroupEditToken: string;
  interactionCheckbox: string;
  joinCheckbox: string;
  maxAttendeesCheckbox: string;
  maxAttendees: number;
  approveRegistrationsCheckbox?: string; // optional checkbox value
}

// EventData without the 'checkbox' fields
export type ValidatedEventData = Omit<
  EventData,
  | "publicCheckbox"
  | "eventGroupCheckbox"
  | "interactionCheckbox"
  | "joinCheckbox"
  | "maxAttendeesCheckbox"
  | "approveRegistrationsCheckbox"
> & {
  publicBoolean: boolean;
  eventGroupBoolean: boolean;
  interactionBoolean: boolean;
  joinBoolean: boolean;
  maxAttendeesBoolean: boolean;
  approveRegistrationsBoolean: boolean;
};

interface EventGroupData {
  eventGroupName: string;
  eventGroupDescription: string;
  eventGroupURL: string;
  hostName: string;
  creatorEmail: string;
  publicCheckbox: string;
  groupColorIndex?: string;
  recurrenceEnabled?: string;
  recurrenceFrequency?: string;
  recurrenceDayOfWeek?: string;
  recurrenceDayOfMonth?: string;
  recurrenceMonthlyType?: string;
  recurrenceNth?: string;
  recurrenceNthDayOfWeek?: string;
  recurrenceTime?: string;
  recurrenceTimezone?: string;
  recurrenceDurationMinutes?: string;
}

export type ValidatedEventGroupData = Omit<
  EventGroupData,
  "publicCheckbox" | "recurrenceEnabled" | "groupColorIndex"
> & {
  publicBoolean: boolean;
  recurrenceEnabled: boolean;
  colorIndex?: number;
};

const validateEmail = (email: string) => {
  if (!email || email.length === 0 || typeof email !== "string") {
    return false;
  }
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// From https://stackoverflow.com/a/43467144
const validateUrl = (url: string) => {
  if (!url) {
    return false;
  }
  let validUrl;
  try {
    validUrl = new URL(url);
  } catch {
    return false;
  }
  return validUrl.protocol === "http:" || validUrl.protocol === "https:";
};

export const validateEventTime = (
  start: string,
  end: string,
  timezone: string,
): Error | boolean => {
  // Parse the datetime-local values in the event's timezone
  const startMoment = moment.tz(start, timezone);
  const endMoment = moment.tz(end, timezone);
  const now = moment();

  if (startMoment.isAfter(endMoment)) {
    return {
      message: i18next.t("util.validation.eventtime.startisafter"),
      field: "eventStart",
    };
  }
  if (endMoment.isBefore(now)) {
    return {
      message: i18next.t("util.validation.eventtime.endisbefore"),
      field: "eventEnd",
    };
  }
  // Duration cannot be longer than 1 year
  if (endMoment.diff(startMoment, "years") > 1) {
    return {
      message: i18next.t("util.validation.eventtime.endyears"),
      field: "eventEnd",
    };
  }
  return true;
};

export interface RecurrenceRuleFields {
  recurrenceFrequency?: string;
  recurrenceDayOfWeek?: string;
  recurrenceMonthlyType?: string;
  recurrenceDayOfMonth?: string;
  recurrenceNth?: string;
  recurrenceNthDayOfWeek?: string;
  recurrenceTime?: string;
  recurrenceTimezone?: string;
  recurrenceDurationMinutes?: string;
}

export type ParsedRecurrenceRule = Omit<IRecurrenceRule, "anchorDate">;

export type RecurrenceParseResponse = {
  rule?: ParsedRecurrenceRule;
  errors: Error[];
};

// Strict integer parsing for form values. `Number("")` is 0 and
// `Number("garbage")` is NaN — both of which used to flow silently into
// stored recurrence rules and poison occurrence computation (a NaN
// dayOfMonth produces an invalid moment, which compares false against
// every bound, so the series generates nothing without any error).
const parseStrictInt = (value: string | undefined): number | null => {
  if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) {
    return null;
  }
  return parseInt(value.trim(), 10);
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Parses and strictly validates recurrence form fields into a typed rule.
 * Every numeric field is parsed with strict integer semantics and range
 * checked; enums are checked against their allowed values; only the fields
 * relevant to the chosen frequency/monthly variant are stored, so a rule
 * can never carry stale values from a variant the user clicked through.
 *
 * When `anchor` is provided (event-level rules, where the event's start is
 * the canonical first occurrence), the rule's day fields are checked
 * against the anchor: a "repeats on Friday" rule attached to an event that
 * starts on a Tuesday is rejected instead of silently repeating on
 * whichever day the backend happens to favor.
 */
export const parseRecurrenceRule = (
  fields: RecurrenceRuleFields,
  anchor?: moment.Moment,
): RecurrenceParseResponse => {
  const errors: Error[] = [];

  const frequency = fields.recurrenceFrequency;
  if (!frequency || !["weekly", "biweekly", "monthly"].includes(frequency)) {
    errors.push({
      message: "Recurrence frequency must be weekly, biweekly, or monthly.",
      field: "recurrenceFrequency",
    });
  }

  const time = fields.recurrenceTime;
  if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    errors.push({
      message: "Recurrence start time is required (HH:MM, 24-hour).",
      field: "recurrenceTime",
    });
  }

  const timezone = fields.recurrenceTimezone;
  if (!timezone || !moment.tz.zone(timezone)) {
    errors.push({
      message: "A valid timezone is required for recurrence.",
      field: "recurrenceTimezone",
    });
  }

  const durationMinutes = parseStrictInt(fields.recurrenceDurationMinutes);
  if (durationMinutes === null || durationMinutes < 1) {
    errors.push({
      message: "Duration must be a whole number of minutes, at least 1.",
      field: "recurrenceDurationMinutes",
    });
  }

  // The anchor's calendar position in the rule's timezone — this is what
  // occurrence stepping actually uses, so it's what day fields must match.
  const anchorInRuleTz =
    anchor && timezone && moment.tz.zone(timezone)
      ? anchor.clone().tz(timezone)
      : undefined;

  let dayOfWeek: number | undefined;
  let monthlyType: "day-of-month" | "nth-weekday" | undefined;
  let dayOfMonth: number | undefined;
  let nth: number | undefined;

  if (frequency === "weekly" || frequency === "biweekly") {
    const dow = parseStrictInt(fields.recurrenceDayOfWeek);
    if (dow === null || dow < 0 || dow > 6) {
      errors.push({
        message: "Day of week must be selected.",
        field: "recurrenceDayOfWeek",
      });
    } else if (anchorInRuleTz && dow !== anchorInRuleTz.day()) {
      errors.push({
        message: `This event starts on a ${DAY_NAMES[anchorInRuleTz.day()]}, but the recurrence is set to repeat on ${DAY_NAMES[dow]}s. Change the repeat day to match the event's start date.`,
        field: "recurrenceDayOfWeek",
      });
    } else {
      dayOfWeek = dow;
    }
  } else if (frequency === "monthly") {
    const type = fields.recurrenceMonthlyType || "day-of-month";
    if (!["day-of-month", "nth-weekday"].includes(type)) {
      errors.push({
        message: "Monthly repeat type must be day-of-month or nth-weekday.",
        field: "recurrenceMonthlyType",
      });
    } else if (type === "day-of-month") {
      monthlyType = "day-of-month";
      const dom = parseStrictInt(fields.recurrenceDayOfMonth);
      if (dom === null || dom < 1 || dom > 31) {
        errors.push({
          message: "Day of month must be a whole number between 1 and 31.",
          field: "recurrenceDayOfMonth",
        });
      } else if (anchorInRuleTz && dom !== anchorInRuleTz.date()) {
        errors.push({
          message: `This event starts on day ${anchorInRuleTz.date()} of the month, but the recurrence is set to repeat on day ${dom}. Change the repeat day to match the event's start date.`,
          field: "recurrenceDayOfMonth",
        });
      } else {
        dayOfMonth = dom;
      }
    } else {
      monthlyType = "nth-weekday";
      const n = parseStrictInt(fields.recurrenceNth);
      if (n === null || ![-1, 1, 2, 3, 4].includes(n)) {
        errors.push({
          message: "Occurrence must be first, second, third, fourth, or last.",
          field: "recurrenceNth",
        });
      } else {
        nth = n;
      }
      const ndow = parseStrictInt(fields.recurrenceNthDayOfWeek);
      if (ndow === null || ndow < 0 || ndow > 6) {
        errors.push({
          message: "Day of week must be selected.",
          field: "recurrenceNthDayOfWeek",
        });
      } else if (anchorInRuleTz && ndow !== anchorInRuleTz.day()) {
        errors.push({
          message: `This event starts on a ${DAY_NAMES[anchorInRuleTz.day()]}, but the recurrence is set to repeat on ${DAY_NAMES[ndow]}s. Change the repeat day to match the event's start date.`,
          field: "recurrenceNthDayOfWeek",
        });
      } else {
        dayOfWeek = ndow;
      }
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors: [],
    rule: {
      enabled: true,
      frequency: frequency as "weekly" | "biweekly" | "monthly",
      dayOfWeek,
      monthlyType,
      dayOfMonth,
      nth,
      time: time!,
      timezone: timezone!,
      durationMinutes: durationMinutes!,
    },
  };
};

export const validateEventData = (
  eventData: EventData,
): EventValidationResponse => {
  const validatedData: ValidatedEventData = {
    ...eventData,
    publicBoolean: eventData.publicCheckbox === "true",
    eventGroupBoolean: eventData.eventGroupCheckbox === "true",
    interactionBoolean: eventData.interactionCheckbox === "true",
    joinBoolean: eventData.joinCheckbox === "true",
    maxAttendeesBoolean: eventData.maxAttendeesCheckbox === "true",
    approveRegistrationsBoolean:
      eventData.approveRegistrationsCheckbox === "true",
  };
  const errors: Error[] = [];
  if (!validatedData.eventName) {
    errors.push({
      message: i18next.t("util.validation.eventdata.eventname"),
      field: "eventName",
    });
  }
  if (!validatedData.eventLocation) {
    errors.push({
      message: i18next.t("util.validation.eventdata.eventlocation"),
      field: "eventLocation",
    });
  }
  if (!validatedData.eventStart) {
    errors.push({
      message: i18next.t("util.validation.eventdata.eventstart"),
      field: "eventStart",
    });
  }
  if (!validatedData.eventEnd) {
    errors.push({
      message: i18next.t("util.validation.eventdata.eventend"),
      field: "eventEnd",
    });
  }
  const timeValidation = validateEventTime(
    validatedData.eventStart,
    validatedData.eventEnd,
    validatedData.timezone,
  );
  if (timeValidation !== true && timeValidation !== false) {
    errors.push({
      message: timeValidation.message,
    });
  }
  if (!validatedData.timezone) {
    errors.push({
      message: i18next.t("util.validation.eventdata.timezone"),
      field: "timezone",
    });
  }
  if (!validatedData.eventDescription) {
    errors.push({
      message: i18next.t("util.validation.eventdata.eventdescription"),
      field: "eventDescription",
    });
  }
  if (validatedData.eventGroupBoolean) {
    if (!validatedData.eventGroupID) {
      errors.push({
        message: i18next.t("util.validation.eventdata.eventgroupboolean"),
        field: "eventGroupID",
      });
    }
    if (!validatedData.eventGroupEditToken) {
      errors.push({
        message: i18next.t("util.validation.eventdata.eventgroupedittoken"),
        field: "eventGroupEditToken",
      });
    }
  }
  if (validatedData.maxAttendeesBoolean) {
    if (!validatedData.maxAttendees) {
      errors.push({
        message: i18next.t("util.validation.eventdata.maxattendeesboolean"),
        field: "maxAttendees",
      });
    }
    if (isNaN(validatedData.maxAttendees)) {
      errors.push({
        message: i18next.t("util.validation.eventdata.maxattendees"),
        field: "maxAttendees",
      });
    }
  }
  if (validatedData.creatorEmail) {
    if (!validateEmail(validatedData.creatorEmail)) {
      errors.push({
        message: i18next.t("util.validation.eventdata.creatoremail"),
        field: "creatorEmail",
      });
    }
  }
  if (validatedData.eventURL) {
    if (!validateUrl(validatedData.eventURL)) {
      errors.push({
        message: i18next.t("util.validation.eventdata.eventurl"),
        field: "eventURL",
      });
    }
  }

  return {
    data: validatedData,
    errors: errors,
  };
};

export const validateGroupData = (
  groupData: EventGroupData,
): EventGroupValidationResponse => {
  const errors: Error[] = [];
  if (!groupData.eventGroupName) {
    errors.push({
      message: i18next.t("util.validation.groupdata.eventgroupname"),
      field: "eventGroupName",
    });
  }
  if (!groupData.eventGroupDescription) {
    errors.push({
      message: i18next.t("util.validation.groupdata.eventgroupdescription"),
      field: "eventGroupDescription",
    });
  }
  if (groupData.creatorEmail) {
    if (!validateEmail(groupData.creatorEmail)) {
      errors.push({
        message: i18next.t("util.validation.groupdata.creatoremail"),
        field: "creatorEmail",
      });
    }
  }
  if (groupData.eventGroupURL && groupData.eventGroupURL !== "undefined") {
    if (!validateUrl(groupData.eventGroupURL)) {
      errors.push({
        message: i18next.t("util.validation.groupdata.eventgroupurl"),
        field: "eventGroupURL",
      });
    }
  }

  // Group label colour: an optional index from 1–8 selecting one of the
  // predefined label colours. Anything outside that range is rejected so an
  // invalid value can't end up styling the label.
  let colorIndex: number | undefined;
  if (
    groupData.groupColorIndex !== undefined &&
    groupData.groupColorIndex !== "" &&
    groupData.groupColorIndex !== "undefined"
  ) {
    const parsed = Number(groupData.groupColorIndex);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 8) {
      errors.push({
        message: i18next.t("util.validation.groupdata.groupcolor"),
        field: "groupColorIndex",
      });
    } else {
      colorIndex = parsed;
    }
  }

  // Recurrence fields are validated by parseRecurrenceRule in the route,
  // which produces the typed rule directly — validating here too would
  // duplicate every error.
  const recurrenceEnabled = groupData.recurrenceEnabled === "true";

  const validatedData: ValidatedEventGroupData = {
    ...groupData,
    publicBoolean: groupData.publicCheckbox === "true",
    recurrenceEnabled,
    colorIndex,
  };

  return {
    data: validatedData,
    errors: errors,
  };
};
