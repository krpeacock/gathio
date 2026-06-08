$(document).ready(function () {
  $.uploadPreview({
    input_field: "#group-image-upload",
    preview_box: "#group-image-preview",
    label_field: "#group-image-label",
    label_default: "Choose file",
    label_selected: "Change file",
    no_label: false,
  });
  if (window.groupData.image) {
    $("#group-image-preview").css(
      "background-image",
      `url('/events/${window.groupData.image}')`,
    );
    $("#group-image-preview").css("background-size", "cover");
    $("#group-image-preview").css("background-position", "center center");
  }
  $("#timezone").val(window.groupData.timezone).trigger("change");

  const recurrenceTz = $("#recurrenceTimezone");
  if (recurrenceTz.length) {
    const savedTz = window.groupData.recurrence?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    recurrenceTz.select2();
    recurrenceTz.val(savedTz).trigger("change");
  }
});

$("#editModal").on("shown.bs.modal", function (e) {
  const ta = document.querySelector("#editModal textarea");
  ta.style.display = "none";
  autosize(ta);
  ta.style.display = "";
  autosize.update(ta);
});

function editEventGroupForm() {
  const rec = window.groupData.recurrence || {};
  return {
    data: {
      eventGroupName: window.groupData.name,
      eventGroupDescription: window.groupData.description,
      eventGroupURL: window.groupData.url,
      hostName: window.groupData.hostName,
      creatorEmail: window.groupData.creatorEmail,
      publicCheckbox: window.groupData.showOnPublicList,
      recurrenceEnabled: !!rec.enabled,
      recurrenceFrequency: rec.frequency || "weekly",
      recurrenceDayOfWeek: rec.dayOfWeek !== undefined ? String(rec.dayOfWeek) : "1",
      recurrenceMonthlyType: rec.monthlyType || "day-of-month",
      recurrenceDayOfMonth: rec.dayOfMonth !== undefined ? String(rec.dayOfMonth) : "1",
      recurrenceNth: rec.nth !== undefined ? String(rec.nth) : "1",
      recurrenceNthDayOfWeek: rec.dayOfWeek !== undefined ? String(rec.dayOfWeek) : "1",
      recurrenceTime: rec.time || "18:00",
      recurrenceTimezone: rec.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      recurrenceDurationMinutes: rec.durationMinutes !== undefined ? String(rec.durationMinutes) : "60",
    },
    init() {
      this.data.publicCheckbox = window.groupData.showOnPublicList;
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
      // Sync timezone from select2 widget
      const recTz = document.getElementById("recurrenceTimezone");
      if (recTz) formData.set("recurrenceTimezone", recTz.value);
      formData.append("imageUpload", this.$refs.eventGroupImageUpload.files[0]);
      formData.append("editToken", window.groupData.editToken);
      try {
        const response = await fetch(`/group/${window.groupData.id}`, {
          method: "PUT",
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
          $("input, textarea").removeClass("is-invalid");
          this.errors.forEach((error) => {
            $(`#${error.field}`).addClass("is-invalid");
          });
          return;
        }
        window.location.reload();
      } catch (error) {
        console.log(error);
        this.errors = unexpectedError;
        this.submitting = false;
      }
    },
  };
}
