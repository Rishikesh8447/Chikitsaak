const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

test("appointment booking uses payment checkout and exposes no legacy booking action", async () => {
  const [appointments, payments, form] = await Promise.all([
    readFile(join(process.cwd(), "actions/appointments.js"), "utf8"),
    readFile(join(process.cwd(), "actions/payments.js"), "utf8"),
    readFile(join(process.cwd(), "app/(main)/doctors/[specialty]/[id]/_components/appointment-form.jsx"), "utf8"),
  ]);
  assert.doesNotMatch(appointments, /bookAppointment|creditTransaction|credits\s*:/i);
  assert.match(payments, /createOnlineAppointmentCheckout/);
  assert.match(form, /createOnlineAppointmentCheckout/);
  assert.match(payments, /createAppointmentCheckout\(formData, "ONLINE", "ONLINE"\)/);
});
