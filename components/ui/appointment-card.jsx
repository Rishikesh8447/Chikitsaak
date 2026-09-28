"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar,
  Clock,
  User,
  Video,
  Stethoscope,
  X,
  Edit,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cancelAppointment,
  addAppointmentNotes,
  markAppointmentCompleted,
  updateAppointmentStatus,
} from "@/actions/doctor";
import { authorizeVideoCall, getAvailableTimeSlots, rescheduleAppointment } from "@/actions/appointments";
import useFetch from "@/hooks/use-fetch";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { PrescriptionForm } from "@/components/prescription-form";
import { ReviewForm } from "@/components/review-form";
import { AiDoctorNoteAssistant } from "@/components/ai-doctor-note-assistant";
import { formatLocalSlotRange } from "@/lib/appointment-time.mjs";

export function AppointmentCard({
  appointment,
  userRole,
  refetchAppointments,
}) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState(null); // 'cancel', 'notes', 'video', or 'complete'
  const [notes, setNotes] = useState(appointment.notes || "");
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState(null);
  const router = useRouter();

  // UseFetch hooks for server actions
  const {
    loading: cancelLoading,
    fn: submitCancel,
    data: cancelData,
  } = useFetch(cancelAppointment);
  const {
    loading: notesLoading,
    fn: submitNotes,
    data: notesData,
  } = useFetch(addAppointmentNotes);
  const {
    loading: tokenLoading,
    fn: submitTokenRequest,
    data: tokenData,
  } = useFetch(authorizeVideoCall);
  const {
    loading: completeLoading,
    fn: submitMarkCompleted,
    data: completeData,
  } = useFetch(markAppointmentCompleted);
  const { loading: statusLoading, fn: submitStatus, data: statusData } = useFetch(updateAppointmentStatus);
  const { loading: slotsLoading, fn: loadSlots, data: slotsData } = useFetch(getAvailableTimeSlots);
  const { loading: rescheduleLoading, fn: submitReschedule, data: rescheduleData } = useFetch(rescheduleAppointment);

  // Format date and time
  const formatDateTime = (dateString) => {
    try {
      return format(new Date(dateString), "MMMM d, yyyy 'at' h:mm a");
    } catch (e) {
      return "Invalid date";
    }
  };

  // Format time only
  const formatTime = (dateString) => {
    try {
      return format(new Date(dateString), "h:mm a");
    } catch (e) {
      return "Invalid time";
    }
  };

  // Check if appointment can be marked as completed
  const canMarkCompleted = () => {
    if (userRole !== "DOCTOR" || appointment.status !== "IN_PROGRESS") {
      return false;
    }
    const now = new Date();
    const appointmentEndTime = new Date(appointment.endTime);
    return now >= appointmentEndTime;
  };

  // Handle cancel appointment
  const handleCancelAppointment = async () => {
    if (cancelLoading) return;

    if (
      window.confirm(
        "Are you sure you want to cancel this appointment? This action cannot be undone."
      )
    ) {
      const formData = new FormData();
      formData.append("appointmentId", appointment.id);
      await submitCancel(formData);
    }
  };

  // Handle mark as completed
  const handleMarkCompleted = async () => {
    if (completeLoading) return;

    // Check if appointment end time has passed
    const now = new Date();
    const appointmentEndTime = new Date(appointment.endTime);

    if (now < appointmentEndTime) {
      alert(
        "Cannot mark appointment as completed before the scheduled end time."
      );
      return;
    }

    if (
      window.confirm(
        "Are you sure you want to mark this appointment as completed? This action cannot be undone."
      )
    ) {
      const formData = new FormData();
      formData.append("appointmentId", appointment.id);
      await submitMarkCompleted(formData);
    }
  };

  const handleStatusChange = async (status) => {
    if (statusLoading) return;
    const formData = new FormData();
    formData.append("appointmentId", appointment.id);
    formData.append("status", status);
    await submitStatus(formData);
  };

  const openReschedule = async () => {
    setRescheduleOpen(true);
    await loadSlots(appointment.doctorId);
  };

  const confirmReschedule = async () => {
    if (!selectedRescheduleSlot || rescheduleLoading) return;
    const formData = new FormData();
    formData.append("appointmentId", appointment.id);
    formData.append("startTime", selectedRescheduleSlot.startTime);
    formData.append("endTime", selectedRescheduleSlot.endTime);
    await submitReschedule(formData);
  };

  // Handle save notes (doctor only)
  const handleSaveNotes = async () => {
    if (notesLoading || userRole !== "DOCTOR") return;

    const formData = new FormData();
    formData.append("appointmentId", appointment.id);
    formData.append("notes", notes);
    await submitNotes(formData);
  };

  // Handle join video call
  const handleJoinVideoCall = async () => {
    if (tokenLoading) return;

    setAction("video");

    const formData = new FormData();
    formData.append("appointmentId", appointment.id);
    await submitTokenRequest(formData);
  };

  // Handle successful operations
  useEffect(() => {
    if (cancelData?.success) {
      toast.success("Appointment cancelled successfully");
      setOpen(false);
      if (refetchAppointments) {
        refetchAppointments();
      } else {
        router.refresh();
      }
    }
  }, [cancelData, refetchAppointments, router]);

  useEffect(() => {
    if (completeData?.success) {
      toast.success("Appointment marked as completed");
      setOpen(false);
      if (refetchAppointments) {
        refetchAppointments();
      } else {
        router.refresh();
      }
    }
  }, [completeData, refetchAppointments, router]);

  useEffect(() => {
    if (notesData?.success) {
      toast.success("Notes saved successfully");
      setAction(null);
      if (refetchAppointments) {
        refetchAppointments();
      } else {
        router.refresh();
      }
    }
  }, [notesData, refetchAppointments, router]);

  useEffect(() => {
    if (tokenData?.success) {
      router.push(`/video-call?appointmentId=${encodeURIComponent(appointment.id)}`);
    } else if (tokenData?.error) {
      setAction(null);
    }
  }, [tokenData, appointment.id, router]);

  useEffect(() => {
    if (statusData?.success) {
      toast.success("Appointment status updated");
      if (refetchAppointments) refetchAppointments(); else router.refresh();
    }
  }, [statusData, refetchAppointments, router]);

  useEffect(() => {
    if (rescheduleData?.success) {
      toast.success("Appointment rescheduled successfully");
      setRescheduleOpen(false);
      setSelectedRescheduleSlot(null);
      if (refetchAppointments) refetchAppointments(); else router.refresh();
    }
  }, [rescheduleData, refetchAppointments, router]);

  // Determine if appointment is active (within 30 minutes of start time)
  const isAppointmentActive = () => {
    const now = new Date();
    const appointmentTime = new Date(appointment.startTime);
    const appointmentEndTime = new Date(appointment.endTime);

    // Can join 30 minutes before start until end time
    return (
      (appointmentTime.getTime() - now.getTime() <= 30 * 60 * 1000 &&
        now < appointmentTime) ||
      (now >= appointmentTime && now <= appointmentEndTime)
    );
  };

  // Determine other party information based on user role
  const otherParty =
    userRole === "DOCTOR" ? appointment.patient : appointment.doctor;

  const otherPartyLabel = userRole === "DOCTOR" ? "Patient" : "Doctor";
  const otherPartyIcon = userRole === "DOCTOR" ? <User /> : <Stethoscope />;

  return (
    <>
      <Card className="border-border transition-colors hover:border-primary/40 shadow-none">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col md:flex-row justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="mt-0.5 shrink-0 rounded-lg bg-primary/10 p-2.5 text-primary">
                {otherPartyIcon}
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-base">
                  {userRole === "DOCTOR"
                    ? otherParty.name
                    : `Dr. ${otherParty.name}`}
                </h3>
                {userRole === "DOCTOR" && (
                  <p className="text-xs text-muted-foreground">
                    {otherParty.email}
                  </p>
                )}
                {userRole === "PATIENT" && (
                  <p className="text-xs text-muted-foreground">
                    {otherParty.specialty}
                  </p>
                )}
                <div className="flex items-center mt-2 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 mr-1.5 text-emerald-600 dark:text-primary shrink-0" />
                  <span>{formatDateTime(appointment.startTime)}</span>
                </div>
                <div className="flex items-center mt-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 mr-1.5 text-emerald-600 dark:text-primary shrink-0" />
                  <span>
                    {formatTime(appointment.startTime)} -{" "}
                    {formatTime(appointment.endTime)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 self-end md:self-start items-end">
              <Badge
                variant="outline"
                className={
                  appointment.status === "COMPLETED"
                    ? "bg-green-700/10 border-green-700/20 text-green-700 dark:text-green-400"
                    : appointment.status === "CANCELLED"
                    ? "bg-red-700/10 border-red-700/20 text-red-700 dark:text-destructive"
                    : appointment.status === "CONFIRMED" || appointment.status === "IN_PROGRESS"
                    ? "bg-primary/10 border-primary/20 text-primary"
                    : "bg-muted border-border text-muted-foreground"
                }
              >
                {appointment.status}
              </Badge>
              <div className="flex gap-2 mt-2 flex-wrap justify-end">
                {canMarkCompleted() && (
                  <Button
                    size="sm"
                    onClick={handleMarkCompleted}
                    disabled={completeLoading}
                    className="font-medium"
                  >
                    {completeLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Complete
                      </>
                    )}
                  </Button>
                )}
                {userRole === "DOCTOR" && appointment.status === "SCHEDULED" && (
                  <Button size="sm" onClick={() => handleStatusChange("CONFIRMED")} disabled={statusLoading}>Confirm</Button>
                )}
                {userRole === "DOCTOR" && appointment.status === "CONFIRMED" && (
                  <Button size="sm" onClick={() => handleStatusChange("IN_PROGRESS")} disabled={statusLoading}>Start</Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="border-border/80 hover:bg-muted text-foreground"
                  onClick={() => setOpen(true)}
                >
                  View Details
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appointment Details Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground">
              Appointment Details
            </DialogTitle>
            <DialogDescription>
              {appointment.status === "SCHEDULED"
                ? "Manage your upcoming appointment"
                : "View appointment information"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Other Party Information */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {otherPartyLabel}
              </h4>
              <div className="flex items-center">
                <div className="h-5 w-5 text-emerald-600 dark:text-primary mr-2 shrink-0">
                  {otherPartyIcon}
                </div>
                <div>
                  <p className="text-foreground font-semibold text-sm">
                    {userRole === "DOCTOR"
                      ? otherParty.name
                      : `Dr. ${otherParty.name}`}
                  </p>
                  {userRole === "DOCTOR" && (
                    <p className="text-muted-foreground text-xs">
                      {otherParty.email}
                    </p>
                  )}
                  {userRole === "PATIENT" && (
                    <p className="text-muted-foreground text-xs">
                      {otherParty.specialty}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Appointment Time */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Scheduled Time
              </h4>
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 text-emerald-600 dark:text-primary mr-2 shrink-0" />
                  <p className="text-foreground font-medium">
                    {formatDateTime(appointment.startTime)}
                  </p>
                </div>
                <div className="flex items-center">
                  <Clock className="h-4 w-4 text-emerald-600 dark:text-primary mr-2 shrink-0" />
                  <p className="text-foreground font-medium">
                    {formatTime(appointment.startTime)} -{" "}
                    {formatTime(appointment.endTime)}
                  </p>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </h4>
              <Badge
                variant="outline"
                className={
                  appointment.status === "COMPLETED"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-primary font-medium"
                    : appointment.status === "CANCELLED"
                    ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-destructive font-medium"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 font-medium"
                }
              >
                {appointment.status}
              </Badge>
            </div>

            {/* Patient Description */}
            {appointment.patientDescription && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {userRole === "DOCTOR"
                    ? "Patient Description"
                    : "Your Description"}
                </h4>
                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/80">
                  <p className="text-foreground text-sm whitespace-pre-line leading-relaxed">
                    {appointment.patientDescription}
                  </p>
                </div>
              </div>
            )}

            {userRole === "DOCTOR" && (appointment.aiSummary || appointment.aiSpecialtySuggestion) && (
              <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
                <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">AI-generated pre-consultation information</h4>
                {appointment.aiSummary && <p className="whitespace-pre-line text-sm text-foreground">{appointment.aiSummary}</p>}
                {appointment.aiSpecialtySuggestion && <p className="text-xs text-muted-foreground">Possible specialty to consider: {appointment.aiSpecialtySuggestion}</p>}
                <p className="text-xs text-muted-foreground">This is not a diagnosis or official clinical record. Review it independently.</p>
              </div>
            )}

            {/* Join Video Call Button */}
            {userRole === "DOCTOR" && appointment.status === "CONFIRMED" && (
              <Button variant="outline" onClick={() => handleStatusChange("NO_SHOW")} disabled={statusLoading} className="border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10">Mark No-show</Button>
            )}
            {userRole === "PATIENT" && ["SCHEDULED", "CONFIRMED"].includes(appointment.status) && (
              <Button variant="outline" onClick={openReschedule} disabled={slotsLoading} className="border-emerald-500/30 text-emerald-600 dark:text-primary hover:bg-emerald-500/10">Reschedule</Button>
            )}
            {appointment.status === "SCHEDULED" && (
              <p className="text-sm text-muted-foreground">Waiting for doctor confirmation.</p>
            )}
            {["CONFIRMED", "IN_PROGRESS"].includes(appointment.status) && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Video Consultation
                </h4>
                <Button
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-xs"
                  disabled={
                    !isAppointmentActive() || action === "video" || tokenLoading
                  }
                  onClick={handleJoinVideoCall}
                >
                  {tokenLoading || action === "video" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Preparing Video Call...
                    </>
                  ) : (
                    <>
                      <Video className="h-4 w-4 mr-2" />
                      {isAppointmentActive()
                        ? "Join Video Call"
                        : "Video call will be available 30 minutes before appointment"}
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Doctor Notes (Doctor can view/edit, Patient can only view) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Doctor Notes
                </h4>
                {userRole === "DOCTOR" &&
                  action !== "notes" &&
                  appointment.status !== "CANCELLED" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAction("notes")}
                      className="h-7 text-emerald-600 dark:text-primary hover:text-emerald-700 hover:bg-emerald-500/10"
                    >
                      <Edit className="h-3.5 w-3.5 mr-1" />
                      {appointment.notes ? "Edit" : "Add"}
                    </Button>
                  )}
              </div>

              {userRole === "DOCTOR" && action === "notes" ? (
                <div className="space-y-3">
                  <AiDoctorNoteAssistant appointmentId={appointment.id} onAccept={setNotes} />
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Enter your clinical notes here..."
                    className="bg-background border-border min-h-[100px] text-sm text-foreground"
                  />
                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAction(null);
                        setNotes(appointment.notes || "");
                      }}
                      disabled={notesLoading}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveNotes}
                      disabled={notesLoading}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {notesLoading ? (
                        <>
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Notes"
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/80 min-h-[80px]">
                  {appointment.notes ? (
                    <p className="text-foreground text-sm whitespace-pre-line leading-relaxed">
                      {appointment.notes}
                    </p>
                  ) : (
                    <p className="text-muted-foreground italic text-xs">
                      No notes added yet
                    </p>
                  )}
                </div>
              )}
            </div>

            {userRole === "DOCTOR" && ["IN_PROGRESS", "COMPLETED"].includes(appointment.status) && (
              <div className="space-y-2 rounded-xl border border-border/80 p-3.5 bg-muted/20">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Digital Prescription</h4>
                <PrescriptionForm appointmentId={appointment.id} existing={appointment.prescription} />
              </div>
            )}

            {userRole === "PATIENT" && appointment.status === "COMPLETED" && (
              <div className="space-y-2 rounded-xl border border-border/80 p-3.5 bg-muted/20">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rate this consultation</h4>
                <ReviewForm appointmentId={appointment.id} existing={appointment.review} />
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between sm:space-x-2">
            <div className="flex gap-2">
              {/* Mark as Complete Button - Only for doctors */}
              {canMarkCompleted() && (
                <Button
                  onClick={handleMarkCompleted}
                  disabled={completeLoading}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {completeLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Completing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Mark Complete
                    </>
                  )}
                </Button>
              )}

              {/* Cancel Button - For scheduled appointments */}
            {["SCHEDULED", "CONFIRMED"].includes(appointment.status) && (
                <Button
                  variant="outline"
                  onClick={handleCancelAppointment}
                  disabled={cancelLoading}
                  className="border-red-500/30 text-red-600 dark:text-destructive hover:bg-red-500/10 mt-3 sm:mt-0"
                >
                  {cancelLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    <>
                      <X className="h-4 w-4 mr-1" />
                      Cancel Appointment
                    </>
                  )}
                </Button>
              )}
            </div>

            <Button
              onClick={() => setOpen(false)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="text-foreground font-bold">Reschedule appointment?</DialogTitle><DialogDescription>Select a new available 30-minute slot. Your credits will not change.</DialogDescription></DialogHeader>
          <div className="max-h-80 space-y-4 overflow-y-auto py-2">
            {slotsLoading ? <p className="text-xs text-muted-foreground">Loading available slots...</p> : slotsData?.days?.map((day) => <div key={day.date}><h4 className="mb-2 text-xs font-semibold text-foreground">{day.displayDate}</h4><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{day.slots.map((slot) => <Button key={slot.startTime} variant={selectedRescheduleSlot?.startTime === slot.startTime ? "default" : "outline"} onClick={() => setSelectedRescheduleSlot(slot)}>{formatLocalSlotRange(slot.startTime, slot.endTime)}</Button>)}</div></div>)}
            {!slotsLoading && !slotsData?.days?.some((day) => day.slots.length) && <p className="text-xs text-muted-foreground">No available appointments for these dates.</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setRescheduleOpen(false)}>Cancel</Button><Button onClick={confirmReschedule} disabled={!selectedRescheduleSlot || rescheduleLoading} className="bg-primary text-primary-foreground hover:bg-primary/90">{rescheduleLoading ? "Rescheduling..." : "Confirm Reschedule"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
