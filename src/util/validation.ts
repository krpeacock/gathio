import i18next from "i18next";
import moment from "moment-timezone";

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

export type ValidatedEventGroupData = Omit<EventGroupData, "publicCheckbox" | "recurrenceEnabled"> & {
  publicBoolean: boolean;
  recurrenceEnabled: boolean;
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
  if (groupData.eventGroupURL) {
    if (!validateUrl(groupData.eventGroupURL)) {
      errors.push({
        message: i18next.t("util.validation.groupdata.eventgroupurl"),
        field: "eventGroupURL",
      });
    }
  }

  const recurrenceEnabled = groupData.recurrenceEnabled === "true";

  if (recurrenceEnabled) {
    const freq = groupData.recurrenceFrequency;
    if (!freq || !["weekly", "biweekly", "monthly"].includes(freq)) {
      errors.push({ message: "Recurrence frequency must be weekly, biweekly, or monthly.", field: "recurrenceFrequency" });
    }
    if ((freq === "weekly" || freq === "biweekly")) {
      const dow = Number(groupData.recurrenceDayOfWeek);
      if (isNaN(dow) || dow < 0 || dow > 6) {
        errors.push({ message: "Day of week must be 0–6.", field: "recurrenceDayOfWeek" });
      }
    }
    if (freq === "monthly") {
      const monthlyType = groupData.recurrenceMonthlyType || "day-of-month";
      if (!["day-of-month", "nth-weekday"].includes(monthlyType)) {
        errors.push({ message: "Monthly type must be day-of-month or nth-weekday.", field: "recurrenceMonthlyType" });
      } else if (monthlyType === "day-of-month") {
        const dom = Number(groupData.recurrenceDayOfMonth);
        if (isNaN(dom) || dom < 1 || dom > 31) {
          errors.push({ message: "Day of month must be 1–31.", field: "recurrenceDayOfMonth" });
        }
      } else {
        const nth = Number(groupData.recurrenceNth);
        if (![-1, 1, 2, 3, 4].includes(nth)) {
          errors.push({ message: "Occurrence must be 1–4 or -1 (last).", field: "recurrenceNth" });
        }
        const ndow = Number(groupData.recurrenceNthDayOfWeek);
        if (isNaN(ndow) || ndow < 0 || ndow > 6) {
          errors.push({ message: "Day of week must be 0–6.", field: "recurrenceNthDayOfWeek" });
        }
      }
    }
    if (!groupData.recurrenceTime || !/^\d{2}:\d{2}$/.test(groupData.recurrenceTime)) {
      errors.push({ message: "Recurrence time must be in HH:MM format.", field: "recurrenceTime" });
    }
    if (!groupData.recurrenceTimezone || !moment.tz.zone(groupData.recurrenceTimezone)) {
      errors.push({ message: "A valid timezone is required for recurrence.", field: "recurrenceTimezone" });
    }
    const dur = Number(groupData.recurrenceDurationMinutes);
    if (isNaN(dur) || dur < 1) {
      errors.push({ message: "Duration must be at least 1 minute.", field: "recurrenceDurationMinutes" });
    }
  }

  const validatedData: ValidatedEventGroupData = {
    ...groupData,
    publicBoolean: groupData.publicCheckbox === "true",
    recurrenceEnabled,
  };

  return {
    data: validatedData,
    errors: errors,
  };
};
