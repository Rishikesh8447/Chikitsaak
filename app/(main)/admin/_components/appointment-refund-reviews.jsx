"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { decideAppointmentRefundReview } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function AppointmentRefundReviews({ reviews }) {
  const router = useRouter();
  const [notes, setNotes] = useState({});
  const [pendingId, setPendingId] = useState(null);

  async function decide(review, decision) {
    const action = decision === "APPROVED" ? "Approve" : "Reject";
    if (!notes[review.id]?.trim()) {
      toast.error("Add an audit note before recording a decision.");
      return;
    }
    if (!window.confirm(`${action} this refund review? This records an admin decision only and does not send money.`)) return;

    const formData = new FormData();
    formData.set("paymentId", review.id);
    formData.set("decision", decision);
    formData.set("note", notes[review.id].trim());
    setPendingId(review.id);
    try {
      await decideAppointmentRefundReview(formData);
      toast.success(`Refund review ${decision.toLowerCase()}. No refund was sent.`);
      router.refresh();
    } catch {
      toast.error("Unable to record this refund decision. Refresh and try again.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appointment refund review</CardTitle>
        <CardDescription>Record an approval or rejection with an audit note. An approval does not send a refund.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {reviews.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No appointment refunds need review.</p> : reviews.map((review) => (
          <article key={review.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <h3 className="font-medium">{review.appointment.patient.name || "Patient"} · Dr. {review.appointment.doctor.name || "Doctor"}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(review.appointment.startTime).toLocaleString()} · Appointment {review.appointment.status.toLowerCase().replaceAll("_", " ")}
                </p>
              </div>
              <p className="text-sm font-semibold">{review.currency} {review.amountRupees}</p>
            </div>
            {review.razorpayPaymentId && <p className="mt-2 break-all text-xs text-muted-foreground">Provider payment: {review.razorpayPaymentId}</p>}
            {review.capturedEvents?.map((event) => (
              <p key={`${event.razorpayPaymentId}-${event.receivedAt}`} className="mt-1 break-all text-xs text-amber-700 dark:text-amber-300">
                Provider capture: {event.currency || "Currency unavailable"} {Number.isInteger(event.amountPaise) ? `${event.amountPaise} minor units` : "amount unavailable"} · {event.razorpayPaymentId || "provider ID unavailable"}
              </p>
            ))}
            <Textarea
              className="mt-4 min-h-20"
              maxLength={2000}
              placeholder="Audit note: summarize the reason for this decision"
              value={notes[review.id] || ""}
              onChange={(event) => setNotes((current) => ({ ...current, [review.id]: event.target.value }))}
              aria-label={`Audit note for ${review.appointment.patient.name || "patient"}`}
            />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={pendingId !== null} onClick={() => decide(review, "REJECTED")}>
                {pendingId === review.id ? <Loader2 className="mr-2 size-4 animate-spin" /> : <X className="mr-2 size-4" />}
                Reject
              </Button>
              <Button type="button" disabled={pendingId !== null} onClick={() => decide(review, "APPROVED")}>
                {pendingId === review.id ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
                Approve
              </Button>
            </div>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
