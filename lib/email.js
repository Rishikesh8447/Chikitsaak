import { Resend } from "resend";
import { format } from "date-fns";

let testResendClient = null;

/**
 * Allows test suites to inject a mocked Resend client without network activity.
 */
export function setResendClientForTesting(client) {
  testResendClient = client;
}

/**
 * Returns the configured base application URL for authenticated links.
 * Inspects deployment environment variables with fallback to production domain.
 */
export function getBaseAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/+$/, "")}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, "")}`;
  }
  return "https://chikitsaak.in";
}

/**
 * Returns the configured from address.
 */
export function getFromAddress() {
  const from = process.env.EMAIL_FROM;
  if (typeof from === "string" && from.trim()) {
    return from.trim();
  }
  return "Chikitsaak <notifications@chikitsaak.in>";
}

/**
 * Returns the Resend client instance if configured.
 */
export function getResendClient() {
  if (testResendClient) {
    return testResendClient;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (typeof apiKey === "string" && apiKey.trim()) {
    return new Resend(apiKey.trim());
  }
  return null;
}

/**
 * Low-level email dispatcher.
 * Never throws exceptions; always returns a structured status object.
 */
export async function sendEmail({ to, subject, html, text }) {
  if (typeof to !== "string" || !to.trim() || !to.includes("@")) {
    return {
      success: false,
      code: "INVALID_RECIPIENT",
      error: "A valid recipient email address is required",
    };
  }

  const client = getResendClient();
  if (!client) {
    return {
      success: false,
      code: "EMAIL_NOT_CONFIGURED",
      skipped: true,
      error: "RESEND_API_KEY is not configured",
    };
  }

  const from = getFromAddress();

  try {
    const { data, error } = await client.emails.send({
      from,
      to: to.trim(),
      subject,
      html,
      text,
    });

    if (error) {
      console.error("Resend API error:", error.message || error);
      return {
        success: false,
        code: "DISPATCH_FAILED",
        error: error.message || "Failed to dispatch email",
      };
    }

    return {
      success: true,
      messageId: data?.id || null,
    };
  } catch (err) {
    console.error("Resend transport exception:", err instanceof Error ? err.message : "Unknown error");
    return {
      success: false,
      code: "TRANSPORT_ERROR",
      error: err instanceof Error ? err.message : "Email transport error",
    };
  }
}

function formatSafeDateTime(dateValue) {
  try {
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return "Scheduled time";
    return format(d, "EEEE, MMMM d, yyyy 'at' h:mm a");
  } catch {
    return "Scheduled time";
  }
}

function wrapEmailLayout({ title, previewText, contentHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:24px;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <div style="background-color:#0f766e;padding:20px 24px;text-align:left;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Chikitsaak</h1>
    </div>
    <div style="padding:24px;">
      ${contentHtml}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px 0;" />
      <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">
        This is an automated notification from Chikitsaak. For your security and privacy, sensitive medical records and full consultation details are accessible exclusively through your authenticated dashboard.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 1. Appointment Booked Email (Standard & Follow-up Included)
 */
export function buildAppointmentBookedEmail({
  recipientRole = "PATIENT",
  recipientName = "Patient",
  otherPartyName = "Doctor",
  startTime,
  consultationMode = "ONLINE",
  isFollowUp = false,
}) {
  const baseUrl = getBaseAppUrl();
  const actionUrl = recipientRole === "DOCTOR" ? `${baseUrl}/doctor` : `${baseUrl}/appointments`;
  const formattedTime = formatSafeDateTime(startTime);
  const modeLabel = consultationMode === "OFFLINE" ? "In-Person Clinic Consultation" : "Online Video Consultation";

  const subject = isFollowUp
    ? "Follow-up consultation scheduled (Included at ₹0) - Chikitsaak"
    : "Appointment scheduled - Chikitsaak";

  const followUpBadgeHtml = isFollowUp
    ? `<div style="display:inline-block;background-color:#ecfdf5;border:1px solid #a7f3d0;border-radius:4px;padding:4px 8px;font-size:12px;font-weight:600;color:#065f46;margin-bottom:12px;">Follow-up Consultation (Included at ₹0)</div>`
    : "";

  const roleMessage = recipientRole === "DOCTOR"
    ? `A new appointment request has been scheduled with ${otherPartyName}.`
    : `Your appointment request with Dr. ${otherPartyName} has been scheduled. Waiting for doctor confirmation.`;

  const followUpExtra = isFollowUp && recipientRole === "PATIENT"
    ? `<p style="margin:8px 0;font-size:13px;color:#047857;font-weight:500;">This follow-up consultation is included at ₹0 with no additional charges.</p>`
    : "";

  const contentHtml = `
    ${followUpBadgeHtml}
    <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:600;color:#0f172a;">${isFollowUp ? "Follow-up Consultation Scheduled" : "Appointment Scheduled"}</h2>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">Hello ${recipientName},</p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">${roleMessage}</p>
    ${followUpExtra}
    <div style="background-color:#f1f5f9;border-radius:6px;padding:16px;margin:16px 0;">
      <div style="font-size:13px;color:#475569;margin-bottom:6px;"><strong>${recipientRole === "DOCTOR" ? "Patient" : "Doctor"}:</strong> ${recipientRole === "DOCTOR" ? otherPartyName : `Dr. ${otherPartyName}`}</div>
      <div style="font-size:13px;color:#475569;margin-bottom:6px;"><strong>Time:</strong> ${formattedTime}</div>
      <div style="font-size:13px;color:#475569;margin-bottom:6px;"><strong>Type:</strong> ${modeLabel}</div>
      <div style="font-size:13px;color:#475569;"><strong>Cost:</strong> ${isFollowUp ? "Included (₹0)" : "Paid consultation"}</div>
    </div>
    <div style="margin:24px 0 12px 0;">
      <a href="${actionUrl}" style="display:inline-block;background-color:#0f766e;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">View Appointments</a>
    </div>
  `;

  const text = `Chikitsaak: ${isFollowUp ? "Follow-up consultation scheduled (Included at ₹0)" : "Appointment scheduled"}
Hello ${recipientName},
${roleMessage}
${isFollowUp ? "Cost: Included at ₹0\n" : ""}
${recipientRole === "DOCTOR" ? "Patient" : "Doctor"}: ${otherPartyName}
Time: ${formattedTime}
Type: ${modeLabel}

View your appointment details: ${actionUrl}`;

  return { subject, html: wrapEmailLayout({ title: subject, contentHtml }), text };
}

/**
 * 2. Appointment Confirmed Email
 */
export function buildAppointmentConfirmedEmail({
  recipientName = "Patient",
  doctorName = "Doctor",
  startTime,
  consultationMode = "ONLINE",
  appointmentId,
}) {
  const baseUrl = getBaseAppUrl();
  const actionUrl = `${baseUrl}/appointments`;
  const formattedTime = formatSafeDateTime(startTime);
  const isOnline = consultationMode !== "OFFLINE";

  const subject = `Appointment confirmed with Dr. ${doctorName} - Chikitsaak`;

  const videoNotice = isOnline
    ? `<p style="margin:12px 0;font-size:13px;color:#0f766e;background:#f0fdfa;border:1px solid #ccfbf1;padding:10px;border-radius:6px;"><strong>Video consultation:</strong> You will be able to join the video call directly from your appointments dashboard starting 30 minutes before the scheduled time.</p>`
    : `<p style="margin:12px 0;font-size:13px;color:#475569;background:#f1f5f9;padding:10px;border-radius:6px;"><strong>In-person consultation:</strong> Please arrive a few minutes before your scheduled appointment time.</p>`;

  const contentHtml = `
    <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:600;color:#0f172a;">Appointment Confirmed</h2>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">Hello ${recipientName},</p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">Dr. ${doctorName} has confirmed your appointment.</p>
    <div style="background-color:#f1f5f9;border-radius:6px;padding:16px;margin:16px 0;">
      <div style="font-size:13px;color:#475569;margin-bottom:6px;"><strong>Doctor:</strong> Dr. ${doctorName}</div>
      <div style="font-size:13px;color:#475569;margin-bottom:6px;"><strong>Time:</strong> ${formattedTime}</div>
      <div style="font-size:13px;color:#475569;"><strong>Consultation type:</strong> ${isOnline ? "Online Video" : "In-Person Clinic"}</div>
    </div>
    ${videoNotice}
    <div style="margin:24px 0 12px 0;">
      <a href="${actionUrl}" style="display:inline-block;background-color:#0f766e;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">Go to My Appointments</a>
    </div>
  `;

  const text = `Chikitsaak: Appointment Confirmed
Hello ${recipientName},
Dr. ${doctorName} has confirmed your appointment for ${formattedTime}.
Consultation type: ${isOnline ? "Online Video" : "In-Person Clinic"}

Manage or join your appointment: ${actionUrl}`;

  return { subject, html: wrapEmailLayout({ title: subject, contentHtml }), text };
}

/**
 * 3. Appointment Cancelled Email
 */
export function buildAppointmentCancelledEmail({
  recipientName = "User",
  otherPartyName = "Doctor",
  recipientRole = "PATIENT",
  startTime,
}) {
  const baseUrl = getBaseAppUrl();
  const actionUrl = recipientRole === "PATIENT" ? `${baseUrl}/doctors` : `${baseUrl}/doctor`;
  const formattedTime = formatSafeDateTime(startTime);

  const subject = "Appointment cancelled - Chikitsaak";

  const contentHtml = `
    <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:600;color:#991b1b;">Appointment Cancelled</h2>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">Hello ${recipientName},</p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">The appointment scheduled for <strong>${formattedTime}</strong> with ${recipientRole === "PATIENT" ? `Dr. ${otherPartyName}` : otherPartyName} has been cancelled.</p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#475569;">If you need to schedule a new consultation or manage existing visits, please visit Chikitsaak.</p>
    <div style="margin:24px 0 12px 0;">
      <a href="${actionUrl}" style="display:inline-block;background-color:#0f766e;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">${recipientRole === "PATIENT" ? "Find Doctors" : "Go to Dashboard"}</a>
    </div>
  `;

  const text = `Chikitsaak: Appointment Cancelled
Hello ${recipientName},
The appointment scheduled for ${formattedTime} with ${otherPartyName} has been cancelled.

Visit Chikitsaak: ${actionUrl}`;

  return { subject, html: wrapEmailLayout({ title: subject, contentHtml }), text };
}

/**
 * 4. Appointment Rescheduled Email
 */
export function buildAppointmentRescheduledEmail({
  recipientName = "User",
  otherPartyName = "Doctor",
  recipientRole = "PATIENT",
  newStartTime,
  consultationMode = "ONLINE",
}) {
  const baseUrl = getBaseAppUrl();
  const actionUrl = recipientRole === "PATIENT" ? `${baseUrl}/appointments` : `${baseUrl}/doctor`;
  const formattedTime = formatSafeDateTime(newStartTime);

  const subject = "Appointment rescheduled - Chikitsaak";

  const contentHtml = `
    <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:600;color:#0f172a;">Appointment Rescheduled</h2>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">Hello ${recipientName},</p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">Your appointment with ${recipientRole === "PATIENT" ? `Dr. ${otherPartyName}` : otherPartyName} has been rescheduled.</p>
    <div style="background-color:#f1f5f9;border-radius:6px;padding:16px;margin:16px 0;">
      <div style="font-size:13px;color:#475569;margin-bottom:6px;"><strong>New Time:</strong> ${formattedTime}</div>
      <div style="font-size:13px;color:#475569;"><strong>Consultation type:</strong> ${consultationMode === "OFFLINE" ? "In-Person Clinic" : "Online Video"}</div>
    </div>
    <div style="margin:24px 0 12px 0;">
      <a href="${actionUrl}" style="display:inline-block;background-color:#0f766e;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">View Rescheduled Appointment</a>
    </div>
  `;

  const text = `Chikitsaak: Appointment Rescheduled
Hello ${recipientName},
Your appointment with ${otherPartyName} has been rescheduled to: ${formattedTime}.

View details: ${actionUrl}`;

  return { subject, html: wrapEmailLayout({ title: subject, contentHtml }), text };
}

/**
 * 5. Appointment Reminder Email (24h and 30m)
 */
export function buildAppointmentReminderEmail({
  recipientName = "Patient",
  otherPartyName = "Doctor",
  recipientRole = "PATIENT",
  startTime,
  reminderType = "TWENTY_FOUR_HOURS",
  consultationMode = "ONLINE",
}) {
  const baseUrl = getBaseAppUrl();
  const actionUrl = recipientRole === "PATIENT" ? `${baseUrl}/appointments` : `${baseUrl}/doctor`;
  const formattedTime = formatSafeDateTime(startTime);
  const timeDesc = reminderType === "THIRTY_MINUTES" ? "30 minutes" : "24 hours";

  const subject = `Reminder: Appointment in ${timeDesc} - Chikitsaak`;

  const contentHtml = `
    <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:600;color:#0f766e;">Upcoming Consultation Reminder</h2>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">Hello ${recipientName},</p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">This is a reminder that your appointment starts in approximately <strong>${timeDesc}</strong>.</p>
    <div style="background-color:#f1f5f9;border-radius:6px;padding:16px;margin:16px 0;">
      <div style="font-size:13px;color:#475569;margin-bottom:6px;"><strong>${recipientRole === "DOCTOR" ? "Patient" : "Doctor"}:</strong> ${recipientRole === "DOCTOR" ? otherPartyName : `Dr. ${otherPartyName}`}</div>
      <div style="font-size:13px;color:#475569;margin-bottom:6px;"><strong>Scheduled Time:</strong> ${formattedTime}</div>
      <div style="font-size:13px;color:#475569;"><strong>Type:</strong> ${consultationMode === "OFFLINE" ? "In-Person Clinic" : "Online Video"}</div>
    </div>
    <div style="margin:24px 0 12px 0;">
      <a href="${actionUrl}" style="display:inline-block;background-color:#0f766e;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">Open Dashboard</a>
    </div>
  `;

  const text = `Chikitsaak: Upcoming Consultation Reminder
Hello ${recipientName},
Your appointment with ${otherPartyName} starts in approximately ${timeDesc} (${formattedTime}).

Access your consultation: ${actionUrl}`;

  return { subject, html: wrapEmailLayout({ title: subject, contentHtml }), text };
}

/**
 * 6. Prescription Available Email (with Privacy Protection & Optional Follow-up Guidance)
 * Strictly omits medicines, dosages, and diagnoses.
 */
export function buildPrescriptionAvailableEmail({
  patientName = "Patient",
  doctorName = "Doctor",
  followUpRequired = false,
  followUpDays = null,
}) {
  const baseUrl = getBaseAppUrl();
  const recordsUrl = `${baseUrl}/medical-records`;
  const appointmentsUrl = `${baseUrl}/appointments`;

  const subject = followUpRequired
    ? `Prescription & Follow-up recommendation available - Chikitsaak`
    : `New prescription available - Chikitsaak`;

  const followUpSection = followUpRequired && followUpDays
    ? `<div style="background-color:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;padding:14px;margin:16px 0;">
        <h3 style="margin:0 0 6px 0;font-size:14px;font-weight:600;color:#065f46;">Recommended Follow-up Consultation</h3>
        <p style="margin:0 0 10px 0;font-size:13px;line-height:1.5;color:#047857;">Dr. ${doctorName} recommended a follow-up consultation within <strong>${followUpDays} days</strong>. This follow-up is <strong>included at ₹0</strong> with no additional fee.</p>
        <a href="${appointmentsUrl}" style="display:inline-block;background-color:#059669;color:#ffffff;padding:8px 16px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:500;">Book Included Follow-up (₹0)</a>
      </div>`
    : "";

  const contentHtml = `
    <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:600;color:#0f172a;">Digital Prescription Available</h2>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">Hello ${patientName},</p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">Dr. ${doctorName} has added a digital prescription for your recent consultation.</p>
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin:16px 0;font-size:13px;color:#475569;">
      To protect your medical privacy, specific medication instructions, dosages, and clinical notes are kept confidential and are viewable only within your secure Chikitsaak portal.
    </div>
    ${followUpSection}
    <div style="margin:24px 0 12px 0;">
      <a href="${recordsUrl}" style="display:inline-block;background-color:#0f766e;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">View Medical Records</a>
    </div>
  `;

  const text = `Chikitsaak: New Prescription Available
Hello ${patientName},
Dr. ${doctorName} has added a digital prescription for your recent consultation.
For your medical privacy, medication details and clinical notes are accessible directly in your secure portal: ${recordsUrl}
${followUpRequired && followUpDays ? `\nFollow-up Recommendation: Dr. ${doctorName} recommended a follow-up consultation within ${followUpDays} days (Included at ₹0). Book your slot at: ${appointmentsUrl}\n` : ""}`;

  return { subject, html: wrapEmailLayout({ title: subject, contentHtml }), text };
}

/**
 * High-level transactional senders.
 */
export async function sendAppointmentBookedEmail(params) {
  const { subject, html, text } = buildAppointmentBookedEmail(params);
  return sendEmail({ to: params.to, subject, html, text });
}

export async function sendAppointmentConfirmedEmail(params) {
  const { subject, html, text } = buildAppointmentConfirmedEmail(params);
  return sendEmail({ to: params.to, subject, html, text });
}

export async function sendAppointmentCancelledEmail(params) {
  const { subject, html, text } = buildAppointmentCancelledEmail(params);
  return sendEmail({ to: params.to, subject, html, text });
}

export async function sendAppointmentRescheduledEmail(params) {
  const { subject, html, text } = buildAppointmentRescheduledEmail(params);
  return sendEmail({ to: params.to, subject, html, text });
}

export async function sendAppointmentReminderEmail(params) {
  const { subject, html, text } = buildAppointmentReminderEmail(params);
  return sendEmail({ to: params.to, subject, html, text });
}

export async function sendPrescriptionAvailableEmail(params) {
  const { subject, html, text } = buildPrescriptionAvailableEmail(params);
  return sendEmail({ to: params.to, subject, html, text });
}
