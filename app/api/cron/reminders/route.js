import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { processDueAppointmentReminders } from "@/lib/reminders";

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDueAppointmentReminders();
    return NextResponse.json(result);
  } catch (error) {
    Sentry.withScope((scope) => {
      scope.setTag("route", "/api/cron/reminders");
      scope.setTag("operation", "process_due_appointment_reminders");
      Sentry.captureException(error);
    });
    console.error("Failed to process appointment reminders:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Reminder processing failed" }, { status: 500 });
  }
}
