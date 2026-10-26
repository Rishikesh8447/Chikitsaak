"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { VideoOff } from "lucide-react";

const SAFE_MESSAGES = new Set([
  "The video call is not currently available",
  "This appointment has ended",
  "You are not authorized to join this call",
  "Waiting for doctor confirmation",
  "Doctor verification is required to join calls",
  "This appointment is not available for video consultation",
]);

export default function VideoCallError({ error, reset }) {
  const displayMessage = error?.message && SAFE_MESSAGES.has(error.message)
    ? error.message
    : "The video consultation could not be loaded. Please verify your connection and try again.";

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <VideoOff className="size-7" />
      </div>
      <h1 className="text-xl font-bold tracking-tight text-foreground">
        Video Consultation Unavailable
      </h1>
      <p role="alert" className="mt-2 max-w-md text-sm text-muted-foreground">
        {displayMessage}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {typeof reset === "function" && (
          <Button type="button" onClick={() => reset()} variant="outline">
            Try again
          </Button>
        )}
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Link href="/appointments">Return to Appointments</Link>
        </Button>
      </div>
    </main>
  );
}
