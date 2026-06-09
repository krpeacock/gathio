$(document).ready(function () {
  if ($("#icsImportControl")[0].files[0] != null) {
    var file = $("#icsImportControl")[0].files[0].name;
    $("#icsImportControl")
      .next("label")
      .html('<i class="far fa-file-alt"></i> ' + file);
  }
  $("#icsImportControl").change(function () {
    var file = $("#icsImportControl")[0].files[0].name;
    $(this)
      .next("label")
      .html('<i class="far fa-file-alt"></i> ' + file);
  });

  $.uploadPreview({
    input_field: "#event-image-upload",
    preview_box: "#event-image-preview",
    label_field: "#event-image-label",
    label_default: "Choose file",
    label_selected: "Change file",
    no_label: false,
  });
  $.uploadPreview({
    input_field: "#group-image-upload",
    preview_box: "#group-image-preview",
    label_field: "#group-image-label",
    label_default: "Choose file",
    label_selected: "Change file",
    no_label: false,
  });
  autosize($("textarea"));
});

function newEventForm() {
  return {
    data: {
      eventName: "",
      eventLocation: "",
      eventStart: "",
      eventEnd: "",
      timezone: "",
      eventDescription: "",
      eventURL: "",
      hostName: "",
      creatorEmail: "",
      eventGroupID: "",
      eventGroupEditToken: "",
      publicCheckbox: false,
      interactionCheckbox: false,
      joinCheckbox: false,
      maxAttendeesCheckbox: false,
      maxAttendees: "",
      approveRegistrationsCheckbox: false,
      recurrenceEnabled: false,
      recurrenceFrequency: "monthly",
      recurrenceDayOfWeek: "5",
      recurrenceMonthlyType: "nth-weekday",
      recurrenceDayOfMonth: "1",
      recurrenceNth: "1",
      recurrenceNthDayOfWeek: "5",
      recurrenceTime: "",
      recurrenceDurationMinutes: "60",
      recurrenceTimezone: "",
    },
    errors: [],
    submitting: false,
    init() {
      // Set up timezone Select2
      this.select2 = $(this.$refs.timezone).select2();
      this.select2.on("select2:select", (event) => {
        this.data.timezone = event.target.value;
      });
      this.data.timezone = this.select2.val();

      // Reset checkboxes
      this.data.eventGroupCheckbox = false;
      this.data.interactionCheckbox = false;
      this.data.joinCheckbox = false;
      this.data.maxAttendeesCheckbox = false;
      this.data.publicCheckbox = false;
      this.data.approveRegistrationsCheckbox = false;

      // Auto-populate recurrenceTime from eventStart when recurrence is enabled
      this.$watch("data.recurrenceEnabled", (enabled) => {
        if (enabled) {
          if (!this.data.recurrenceTime && this.data.eventStart) {
            this.data.recurrenceTime = this.data.eventStart.substring(11, 16);
          }
        }
      });
      // Keep recurrenceTime in sync when the event start time changes
      this.$watch("data.eventStart", () => {
        if (this.data.recurrenceEnabled && this.data.eventStart) {
          this.data.recurrenceTime = this.data.eventStart.substring(11, 16);
        }
      });
    },
    updateEventEnd() {
      if (
        this.data.eventEnd === "" ||
        this.data.eventEnd < this.data.eventStart
      ) {
        this.data.eventEnd = this.data.eventStart;
      }
    },
    async submitForm() {
      this.submitting = true;
      this.errors = [];

      // Read recurrenceTimezone directly from the DOM select since it has no x-model
      const recTz = document.getElementById("recurrenceTimezone");
      const recTzValue = recTz ? recTz.value : "";

      // Pre-submit validation of recurrence fields so the user sees what's
      // wrong instead of waiting on a generic server error.
      if (this.data.recurrenceEnabled) {
        const recErrors = validateRecurrenceFields({
          recurrenceFrequency: this.data.recurrenceFrequency,
          recurrenceDayOfWeek: this.data.recurrenceDayOfWeek,
          recurrenceMonthlyType: this.data.recurrenceMonthlyType,
          recurrenceDayOfMonth: this.data.recurrenceDayOfMonth,
          recurrenceNth: this.data.recurrenceNth,
          recurrenceNthDayOfWeek: this.data.recurrenceNthDayOfWeek,
          recurrenceTime: this.data.recurrenceTime,
          recurrenceTimezone: recTzValue,
          recurrenceDurationMinutes: this.data.recurrenceDurationMinutes,
        });
        if (recErrors.length > 0) {
          this.errors = recErrors;
          this.submitting = false;
          $("input, textarea, select").removeClass("is-invalid");
          recErrors.forEach((error) => {
            if (error.field) $(`#${error.field}`).addClass("is-invalid");
          });
          return;
        }
      }

      const formData = new FormData();
      for (const [key, value] of Object.entries(this.data)) {
        formData.append(key, value);
      }
      if (recTz) formData.set("recurrenceTimezone", recTzValue);
      formData.append("imageUpload", this.$refs.eventImageUpload.files[0]);
      formData.append("magicLinkToken", this.$refs.magicLinkToken.value);
      formData.append(
        "adminMagicLinkToken",
        this.$refs.adminMagicLinkToken.value,
      );
      formData.append("adminEmail", this.$refs.adminEmail.value);
      try {
        const response = await fetch("/event", {
          method: "POST",
          body: formData,
        });
        this.submitting = false;
        if (!response.ok) {
          // Try to surface the server's error message regardless of status
          // code; falling back to the generic message swallows useful detail.
          this.errors = await extractErrors(response);
          $("input, textarea, select").removeClass("is-invalid");
          this.errors.forEach((error) => {
            if (error.field) $(`#${error.field}`).addClass("is-invalid");
          });
          return;
        }
        const json = await response.json();
        window.location.assign(json.url);
      } catch (error) {
        console.log(error);
        this.errors = [
          {
            message: `Could not reach the server: ${error.message || error}`,
          },
        ];
        this.submitting = false;
      }
    },
  };
}
function newEventGroupForm() {
  return {
    data: {
      eventGroupName: "",
      eventGroupDescription: "",
      eventGroupURL: "",
      hostName: "",
      creatorEmail: "",
      publicCheckbox: false,
      recurrenceEnabled: false,
      recurrenceFrequency: "weekly",
      recurrenceDayOfWeek: "1",
      recurrenceMonthlyType: "day-of-month",
      recurrenceDayOfMonth: "1",
      recurrenceNth: "1",
      recurrenceNthDayOfWeek: "1",
      recurrenceTime: "18:00",
      recurrenceDurationMinutes: "60",
      recurrenceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    init() {
      // Reset checkboxes
      this.data.publicCheckbox = false;
    },
    errors: [],
    submitting: false,
    async submitForm() {
      this.submitting = true;
      this.errors = [];
      const recTz = document.getElementById("recurrenceTimezone");
      const recTzValue = recTz ? recTz.value : "";
      if (this.data.recurrenceEnabled) {
        const recErrors = validateRecurrenceFields({
          recurrenceFrequency: this.data.recurrenceFrequency,
          recurrenceDayOfWeek: this.data.recurrenceDayOfWeek,
          recurrenceMonthlyType: this.data.recurrenceMonthlyType,
          recurrenceDayOfMonth: this.data.recurrenceDayOfMonth,
          recurrenceNth: this.data.recurrenceNth,
          recurrenceNthDayOfWeek: this.data.recurrenceNthDayOfWeek,
          recurrenceTime: this.data.recurrenceTime,
          recurrenceTimezone: recTzValue,
          recurrenceDurationMinutes: this.data.recurrenceDurationMinutes,
        });
        if (recErrors.length > 0) {
          this.errors = recErrors;
          this.submitting = false;
          $("input, textarea, select").removeClass("is-invalid");
          recErrors.forEach((error) => {
            if (error.field) $(`#${error.field}`).addClass("is-invalid");
          });
          return;
        }
      }
      const formData = new FormData();
      for (const [key, value] of Object.entries(this.data)) {
        formData.append(key, value);
      }
      if (recTz) formData.set("recurrenceTimezone", recTzValue);
      formData.append("imageUpload", this.$refs.eventGroupImageUpload.files[0]);
      formData.append("magicLinkToken", this.$refs.magicLinkToken.value);
      formData.append(
        "adminMagicLinkToken",
        this.$refs.adminMagicLinkToken.value,
      );
      formData.append("adminEmail", this.$refs.adminEmail.value);
      try {
        const response = await fetch("/group", {
          method: "POST",
          body: formData,
        });
        this.submitting = false;
        if (!response.ok) {
          this.errors = await extractErrors(response);
          $("input, textarea, select").removeClass("is-invalid");
          this.errors.forEach((error) => {
            if (error.field) $(`#${error.field}`).addClass("is-invalid");
          });
          return;
        }
        const json = await response.json();
        window.location.assign(json.url);
      } catch (error) {
        console.log(error);
        this.errors = [
          {
            message: `Could not reach the server: ${error.message || error}`,
          },
        ];
        this.submitting = false;
      }
    },
  };
}

function importEventForm() {
  return {
    data: {
      creatorEmail: "",
    },
    errors: [],
    submitting: false,
    async submitForm() {
      this.submitting = true;
      this.errors = [];
      const formData = new FormData();
      for (const [key, value] of Object.entries(this.data)) {
        formData.append(key, value);
      }
      formData.append("icsImportControl", this.$refs.icsImportControl.files[0]);
      formData.append("magicLinkToken", this.$refs.magicLinkToken.value);
      formData.append(
        "adminMagicLinkToken",
        this.$refs.adminMagicLinkToken.value,
      );
      formData.append("adminEmail", this.$refs.adminEmail.value);
      try {
        const response = await fetch("/import/event", {
          method: "POST",
          body: formData,
        });
        this.submitting = false;
        if (!response.ok) {
          if (response.status !== 400) {
            this.errors = unexpectedError;
            return;
          }
          const json = await response.json();
          this.errors = json.errors;
          return;
        }
        const json = await response.json();
        window.location.assign(json.url);
      } catch (error) {
        console.log(error);
        this.errors = unexpectedError;
        this.submitting = false;
      }
    },
  };
}
