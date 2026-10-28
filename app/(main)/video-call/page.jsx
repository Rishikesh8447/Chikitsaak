import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import VideoCall from "./_components/video-call";
import { getVideoCallCredentials } from "@/actions/appointments";

export default async function VideoCallPage({ searchParams }) {
  const params = await searchParams;
  const appointmentId = params?.appointmentId || params?.sessionId;

  let credentials = null;
  let error = null;

  if (!appointmentId) {
    error = "Appointment ID is required to join a video consultation.";
  } else {
    try {
      credentials = await getVideoCallCredentials(appointmentId);
    } catch (err) {
      error = err instanceof Error ? err.message : "Unable to join video consultation.";
    }
  }

  if (error || !credentials) {
    return (
      <main className="container mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
          <div className="mx-auto size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
            <AlertCircle className="size-6" />
          </div>
          <h1 className="text-base font-bold text-foreground">Video Consultation Unavailable</h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {error || "Could not load video credentials."}
          </p>
          <div className="pt-2">
            <Button asChild size="sm" className="bg-primary text-primary-foreground">
              <Link href="/appointments">Return to Appointments</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <VideoCall
      appId={credentials.appId}
      sessionId={credentials.videoSessionId}
      token={credentials.token}
      appointmentId={appointmentId}
      userRole={credentials.userRole}
    />
  );
}
