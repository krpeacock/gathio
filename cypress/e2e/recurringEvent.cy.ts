import eventData from "../fixtures/eventData.json";

// Pads a number to two digits.
const pad = (n: number) => String(n).padStart(2, "0");

// Builds a datetime-local string (`YYYY-MM-DDTHH:mm`) for an offset from now.
const datetimeLocal = (
  daysFromNow: number,
  hour: number,
  minute = 0,
): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
};

const fillCommonEventFields = () => {
  cy.visit("/new");
  cy.get("#showNewEventFormButton").click();

  cy.get("#eventName").type(eventData.eventName);
  cy.get("#eventLocation").type(eventData.eventLocation);

  cy.get("select#timezone + span.select2").click();
  cy.get(".select2-results__option")
    .contains(eventData.timezone)
    .click({ force: true });

  cy.get("#eventDescription").type(eventData.eventDescription);
  cy.get("#hostName").type(eventData.hostName);
  cy.get("#creatorEmail").type(eventData.creatorEmail);
};

describe("Recurring events", () => {
  it("creates a recurring event and auto-populates recurrenceTime from eventStart", () => {
    // Use a near-future start so generated occurrences land inside the
    // LOOKAHEAD_DAYS=90 window and the assertion that future instances exist
    // is meaningful.
    const start = datetimeLocal(1, 18); // tomorrow 18:00
    const end = datetimeLocal(1, 19); // tomorrow 19:00

    fillCommonEventFields();
    cy.get("#eventStart").type(start);
    cy.get("#eventEnd").type(end);

    // Enable recurrence. recurrenceTime starts as "" — the fix watches
    // recurrenceEnabled and eventStart to auto-populate it. Without that
    // fix, computeOccurrences gets time="" and silently returns no
    // occurrences, which is why this test exists.
    cy.get("#recurrenceEnabled").check();
    cy.get("#recurrenceTime").should("have.value", start.substring(11, 16));

    cy.get("#recurrenceFrequency").select("weekly");
    // The day-of-week select must auto-sync to the event's start day — the
    // server rejects rules whose repeat day contradicts the start date.
    cy.get("#recurrenceDayOfWeek").should(
      "have.value",
      String(new Date(start).getDay()),
    );

    cy.get("#newEventFormSubmit").click();

    // Submission must succeed — no error banner should appear.
    cy.get(".alert.alert-danger").should("not.be.visible");
    cy.url({ timeout: 10000 }).should("not.include", "/new");

    cy.url().then((url) => {
      const eventID = url.split("/").pop()!.split("?")[0];

      // The stored recurrence rule must carry a non-empty time and timezone.
      // Empty values are the root cause of "marked recurring but no
      // occurrences ever appear".
      cy.request(`/api/event/${eventID}`).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.recurrence).to.exist;
        expect(response.body.recurrence.enabled).to.eq(true);
        expect(response.body.recurrence.time).to.match(/^\d{2}:\d{2}$/);
        expect(response.body.recurrence.timezone).to.be.a("string").and.not
          .empty;
        expect(response.body.recurrenceTemplate).to.eq(true);
        expect(response.body.recurrenceId).to.eq(eventID);
      });

      // Force a generation pass and verify future occurrences exist for
      // this series (template + at least one generated instance within the
      // 90-day window for a weekly cadence).
      cy.request("POST", "/api/recurrence/generate")
        .its("status")
        .should("eq", 200);
      cy.request("/api/events?includePast=1").then((response) => {
        const instances = response.body.filter(
          (e: { recurrenceId?: string }) => e.recurrenceId === eventID,
        );
        // Template counts as one; weekly over 90 days should produce many more.
        expect(instances.length).to.be.greaterThan(1);
      });
    });
  });

  it("surfaces validation errors inline instead of silently submitting", () => {
    fillCommonEventFields();
    cy.get("#eventStart").type(datetimeLocal(1, 18));
    cy.get("#eventEnd").type(datetimeLocal(1, 19));

    cy.get("#recurrenceEnabled").check();
    // Clear the auto-populated time so we hit the validation path.
    cy.get("#recurrenceTime").focus();
    cy.get("#recurrenceTime").clear();

    cy.get("#newEventFormSubmit").click();

    // The form should not navigate away — the client validator catches it.
    cy.url().should("include", "/new");
    cy.get(".alert.alert-danger")
      .should("be.visible")
      .and("contain.text", "Recurrence start time is required");
    cy.get("#recurrenceTime").should("have.class", "is-invalid");
  });

  it("rejects a repeat day that contradicts the event's start date", () => {
    const start = datetimeLocal(1, 18);

    fillCommonEventFields();
    cy.get("#eventStart").type(start);
    cy.get("#eventEnd").type(datetimeLocal(1, 19));

    cy.get("#recurrenceEnabled").check();
    cy.get("#recurrenceFrequency").select("weekly");
    // Deliberately pick a different weekday than the start date. The client
    // validator can't know the server's alignment rule, so this exercises
    // the server-side rejection and the inline error surfacing.
    const wrongDay = (new Date(start).getDay() + 1) % 7;
    cy.get("#recurrenceDayOfWeek").select(String(wrongDay));

    cy.get("#newEventFormSubmit").click();

    cy.url().should("include", "/new");
    cy.get(".alert.alert-danger")
      .should("be.visible")
      .and("contain.text", "Change the repeat day to match");
    cy.get("#recurrenceDayOfWeek").should("have.class", "is-invalid");
  });
});
