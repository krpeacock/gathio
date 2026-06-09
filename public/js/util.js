const getStoredToken = function (eventID) {
    try {
        let editTokens = JSON.parse(localStorage.getItem("editTokens"));
        return editTokens[eventID];
    } catch (e) {
        localStorage.setItem("editTokens", JSON.stringify({}));
        return false;
    }
};

const addStoredToken = function (eventID, token) {
    try {
        let editTokens = JSON.parse(localStorage.getItem("editTokens"));
        editTokens[eventID] = token;
        localStorage.setItem("editTokens", JSON.stringify(editTokens));
    } catch (e) {
        localStorage.setItem(
            "editTokens",
            JSON.stringify({ [eventID]: token }),
        );
        return false;
    }
};

const removeStoredToken = function (eventID) {
    try {
        let editTokens = JSON.parse(localStorage.getItem("editTokens"));
        delete editTokens[eventID];
        localStorage.setItem("editTokens", JSON.stringify(editTokens));
    } catch (e) {
        localStorage.setItem("editTokens", JSON.stringify({}));
        return false;
    }
};

const getAdminSession = function() {
    try {
        const session = JSON.parse(localStorage.getItem("adminSession"));
        if (!session || !session.token || !session.email) return null;
        if (session.expiry && new Date(session.expiry) < new Date()) {
            localStorage.removeItem("adminSession");
            return null;
        }
        return session;
    } catch (e) {
        return null;
    }
};

const setAdminSession = function(token, email, expiry) {
    try {
        localStorage.setItem("adminSession", JSON.stringify({ token, email, expiry }));
    } catch (e) {}
};

const clearAdminSession = function() {
    try {
        localStorage.removeItem("adminSession");
    } catch (e) {}
};

const unexpectedError = [
    { message: "An unexpected error has occurred. Please try again later." },
];

// Best-effort extraction of an error list from a fetch Response. Falls back
// through JSON errors → JSON message → raw text → HTTP status so the user
// never gets stranded with a generic "unexpected error" when the server
// actually said something specific.
async function extractErrors(response) {
    try {
        const json = await response.clone().json();
        if (Array.isArray(json.errors) && json.errors.length > 0) {
            return json.errors;
        }
        if (json.message) {
            return [{ message: json.message }];
        }
    } catch (e) {
        // not JSON — fall through
    }
    try {
        const text = await response.text();
        if (text) {
            return [{ message: `Server error (${response.status}): ${text.slice(0, 500)}` }];
        }
    } catch (e) {
        // ignore
    }
    return [{ message: `Server error (${response.status}).` }];
}

// Client-side mirror of util/validation.ts recurrence checks. Lets the
// new-event form surface the exact field error inline before the user
// submits, which matters because an empty recurrenceTime or timezone used to
// silently produce a recurring event that never generated occurrences.
function validateRecurrenceFields(fields) {
    const errors = [];
    const freq = fields.recurrenceFrequency;
    if (!["weekly", "biweekly", "monthly"].includes(freq)) {
        errors.push({
            message: "Recurrence frequency must be weekly, biweekly, or monthly.",
            field: "recurrenceFrequency",
        });
    }
    if (freq === "weekly" || freq === "biweekly") {
        const dow = Number(fields.recurrenceDayOfWeek);
        if (Number.isNaN(dow) || dow < 0 || dow > 6) {
            errors.push({
                message: "Day of week must be selected.",
                field: "recurrenceDayOfWeek",
            });
        }
    }
    if (freq === "monthly") {
        const monthlyType = fields.recurrenceMonthlyType || "day-of-month";
        if (monthlyType === "day-of-month") {
            const dom = Number(fields.recurrenceDayOfMonth);
            if (Number.isNaN(dom) || dom < 1 || dom > 31) {
                errors.push({
                    message: "Day of month must be between 1 and 31.",
                    field: "recurrenceDayOfMonth",
                });
            }
        } else if (monthlyType === "nth-weekday") {
            const nth = Number(fields.recurrenceNth);
            if (![-1, 1, 2, 3, 4].includes(nth)) {
                errors.push({
                    message: "Occurrence (first, second, …, last) must be selected.",
                    field: "recurrenceNth",
                });
            }
            const ndow = Number(fields.recurrenceNthDayOfWeek);
            if (Number.isNaN(ndow) || ndow < 0 || ndow > 6) {
                errors.push({
                    message: "Day of week must be selected.",
                    field: "recurrenceNthDayOfWeek",
                });
            }
        }
    }
    if (
        !fields.recurrenceTime ||
        !/^\d{2}:\d{2}$/.test(fields.recurrenceTime)
    ) {
        errors.push({
            message: "Recurrence start time is required (HH:MM).",
            field: "recurrenceTime",
        });
    }
    if (!fields.recurrenceTimezone) {
        errors.push({
            message: "Recurrence timezone is required.",
            field: "recurrenceTimezone",
        });
    }
    const dur = Number(fields.recurrenceDurationMinutes);
    if (Number.isNaN(dur) || dur < 1) {
        errors.push({
            message: "Duration must be at least 1 minute.",
            field: "recurrenceDurationMinutes",
        });
    }
    return errors;
}
