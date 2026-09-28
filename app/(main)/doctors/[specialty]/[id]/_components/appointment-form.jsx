"use client";

import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Loader2, Clock, ArrowLeft, Calendar, CreditCard } from "lucide-react";
import { bookAppointment } from "@/actions/appointments";
import { toast } from "sonner";
import useFetch from "@/hooks/use-fetch";
import { AiPreconsultation } from "@/components/ai-preconsultation";
import { formatLocalSlotRange } from "@/lib/appointment-time.mjs";

export function AppointmentForm({ doctorId, slot, onBack, onComplete }) {
  const [description, setDescription] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [aiSpecialtySuggestion, setAiSpecialtySuggestion] = useState("");

  // Use the useFetch hook to handle loading, data, and error states
  const { loading, data, fn: submitBooking } = useFetch(bookAppointment);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Create form data
    const formData = new FormData();
    formData.append("doctorId", doctorId);
    formData.append("startTime", slot.startTime);
    formData.append("endTime", slot.endTime);
    formData.append("description", description);
    if (aiSummary.trim()) formData.append("aiSummary", aiSummary);
    if (aiSpecialtySuggestion.trim()) formData.append("aiSpecialtySuggestion", aiSpecialtySuggestion);

    // Submit booking using the function from useFetch
    await submitBooking(formData);
  };

  // Handle response after booking attempt
  useEffect(() => {
    if (data) {
      if (data.success) {
        toast.success("Appointment booked successfully!");
        onComplete();
      } else if (data.message) {
        toast.error(data.message);
      }
    }
  }, [data, onComplete]);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center">
          <Calendar className="mr-2 h-5 w-5 text-primary" />
          <span className="font-medium text-foreground">
            {format(new Date(slot.startTime), "EEEE, MMMM d, yyyy")}
          </span>
        </div>
        <div className="flex items-center">
          <Clock className="mr-2 h-5 w-5 text-primary" />
          <span className="text-foreground">{formatLocalSlotRange(slot.startTime, slot.endTime)}</span>
        </div>
        <div className="flex items-center">
          <CreditCard className="mr-2 h-5 w-5 text-primary" />
          <span className="text-muted-foreground">
            Appointment cost: <span className="font-semibold text-foreground">2 credits</span>
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">
          Describe your medical concern (optional)
        </Label>
        <Textarea
          id="description"
          placeholder="Please provide any details about your medical concern or what you'd like to discuss in the appointment..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-32 bg-background"
        />
        <p className="text-sm text-muted-foreground">
          This information will be shared with the doctor before your
          appointment.
        </p>
      </div>

      <AiPreconsultation description={description} summary={aiSummary} setSummary={setAiSummary} specialtySuggestion={aiSpecialtySuggestion} setSpecialtySuggestion={setAiSpecialtySuggestion} />

      {data && !data.success && data.message && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{data.message}</p>}

      <div className="flex flex-col-reverse justify-between gap-2 pt-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={loading}
          className="w-full sm:w-auto"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Change Time Slot
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className="min-h-11 w-full sm:min-w-40 sm:w-auto"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Booking...
            </>
          ) : (
            "Confirm Booking"
          )}
        </Button>
      </div>
    </form>
  );
}
