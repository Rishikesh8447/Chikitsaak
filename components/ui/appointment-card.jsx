"use client";

import { useState, useEffect, useRef } from "react";
import Script from "next/script";
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
  recordCashAppointmentCollection,
} from "@/actions/doctor";
import {
  authorizeVideoCall,
  getAvailableTimeSlots,
  rescheduleAppointment,
  scheduleFollowUpAppointment,
} from "@/actions/appointments";
import useFetch from "@/hooks/use-fetch";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { PrescriptionForm } from "@/components/prescription-form";
import { ReviewForm } from "@/components/review-form";
import { AiDoctorNoteAssistant } from "@/components/ai-doctor-note-assistant";
import { formatLocalSlotRange } from "@/lib/appointment-time.mjs";
import { getAppointmentPaymentLabel } from "@/lib/appointment-payment-display.mjs";
import { resumePendingAppointmentCheckout, verifyOnlineAppointmentPayment } from "@/actions/payments";
import {
  calculateRecommendedFollowUpDate,
  isOriginalAppointmentEligibleForFollowUp,
  getDoctorSupportedModes,
} from "@/lib/follow-up-appointment.mjs";

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
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [selectedFollowUpSlot, setSelectedFollowUpSlot] = useState(null);
  const [followUpMode, setFollowUpMode] = useState("ONLINE");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [followUpError, setFollowUpError] = useState(null);
  const [resumeCheckoutLoading, setResumeCheckoutLoading] = useState(false);
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [resumeStatusMessage, setResumeStatusMessage] = useState(null);
  const handledStatusResult = useRef(null);
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
    error: tokenError,
  } = useFetch(authorizeVideoCall);
  const {
    loading: completeLoading,
    fn: submitMarkCompleted,
    data: completeData,
  } = useFetch(markAppointmentCompleted);
  const { loading: statusLoading, fn: submitStatus, data: statusData } = useFetch(updateAppointmentStatus);
  const { loading: cashCollectionLoading, fn: submitCashCollection, data: cashCollectionData } = useFetch(recordCashAppointmentCollection);
  const { loading: slotsLoading, fn: loadSlots, data: slotsData } = useFetch(getAvailableTimeSlots);
  const { loading: rescheduleLoading, fn: submitReschedule, data: rescheduleData } = useFetch(rescheduleAppointment);
  const { loading: followUpSlotsLoading, fn: loadFollowUpSlots, data: followUpSlotsData } = useFetch(getAvailableTimeSlots);
  const {
    loading: followUpLoading,
    fn: submitFollowUp,
    data: followUpData,
    error: followUpSubmitError,
  } = useFetch(scheduleFollowUpAppointment);

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

  const handleRecordCashCollection = async () => {
    if (cashCollectionLoading || userRole !== "DOCTOR") return;
    if (!window.confirm(`Record INR ${appointment.payment?.amountRupees} cash as collected?`)) return;
    const formData = new FormData();
    formData.append("appointmentId", appointment.id);
    await submitCashCollection(formData);
  };

  const handleResumeCheckout = async () => {
    if (resumeCheckoutLoading || !razorpayReady || userRole !== "PATIENT") return;
    setResumeCheckoutLoading(true);
    try {
      const checkout = await resumePendingAppointmentCheckout(appointment.id);
      if (!checkout?.success) {
        if (["PAYMENT_PROCESSING", "REFUND_REVIEW_REQUIRED", "CHECKOUT_NOT_RESUMABLE"].includes(checkout?.code)) {
          setResumeStatusMessage(checkout.message || "This checkout cannot be resumed safely.");
        }
        toast.error(checkout?.message || "This checkout cannot be resumed safely.");
        router.refresh();
        setResumeCheckoutLoading(false);
        return;
      }
      const razorpay = new window.Razorpay({
        key: checkout.keyId,
        order_id: checkout.orderId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: "Chikitsaak",
        description: checkout.method === "UPI_QR" ? "In-person doctor consultation" : "Online doctor consultation",
        theme: { color: "#0f766e" },
        ...(checkout.method === "UPI_QR" ? {
          config: {
            display: {
              blocks: { upi: { name: "UPI / QR", instruments: [{ method: "upi" }] } },
              sequence: ["block.upi"],
              preferences: { show_default_blocks: false },
            },
          },
        } : {}),
        modal: { escape: true, ondismiss: () => setResumeCheckoutLoading(false) },
        handler: async (response) => {
          try {
            const result = await verifyOnlineAppointmentPayment({
              appointmentId: checkout.appointmentId,
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            if (result?.success) toast.success("Payment verified and appointment request booked.");
            else {
              if (["REFUND_REVIEW_REQUIRED", "PAYMENT_RECONCILIATION_PENDING"].includes(result?.code)) {
                setResumeStatusMessage(result.message);
              }
              toast.error(result?.message || "Payment confirmation is pending. Do not pay again.");
            }
          } catch {
            const message = "Payment was submitted, but confirmation is pending. Do not pay again.";
            setResumeStatusMessage(message);
            toast.error(message);
          } finally {
            setResumeCheckoutLoading(false);
            router.refresh();
          }
        },
      });
      razorpay.on("payment.failed", () => {
        toast.error("Payment was not completed. You can retry while the checkout hold is active.");
        setResumeCheckoutLoading(false);
      });
      razorpay.open();
    } catch {
      toast.error("Payment status could not be checked. Do not pay again; try again later.");
      setResumeCheckoutLoading(false);
    }
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

  const openFollowUp = async () => {
    setFollowUpOpen(true);
    setSelectedFollowUpSlot(null);
    setFollowUpNotes("");
    setFollowUpError(null);
    const supported = getDoctorSupportedModes(appointment.doctor);
    const defaultMode = supported.includes(appointment.consultationMode)
      ? appointment.consultationMode
      : (supported[0] || "ONLINE");
    setFollowUpMode(defaultMode);
    await loadFollowUpSlots(appointment.doctorId);
  };

  const handleSubmitFollowUp = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!selectedFollowUpSlot || followUpLoading) return;
    setFollowUpError(null);
    const formData = new FormData();
    formData.append("originalAppointmentId", appointment.id);
    formData.append("startTime", selectedFollowUpSlot.startTime);
    formData.append("endTime", selectedFollowUpSlot.endTime);
    formData.append("consultationMode", followUpMode);
    if (followUpNotes.trim()) {
      formData.append("patientDescription", followUpNotes.trim());
    }
    try {
      await submitFollowUp(formData);
    } catch (err) {
      setFollowUpError(err?.message || "Failed to schedule follow-up appointment");
    }
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
    try {
      await submitTokenRequest(formData);
    } catch {
      setAction(null);
    }
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
    } else if (tokenData?.error || tokenError) {
      setAction(null);
    }
  }, [tokenData, tokenError, appointment.id, router]);

  useEffect(() => {
    if (statusData?.success && handledStatusResult.current !== statusData) {
      handledStatusResult.current = statusData;
      toast.success("Appointment status updated");
      if (refetchAppointments) refetchAppointments(); else router.refresh();
    }
  }, [statusData, refetchAppointments, router]);

  useEffect(() => {
    if (cashCollectionData?.success) {
      toast.success(cashCollectionData.alreadyCollected ? "Cash was already recorded as collected" : "Cash collection recorded");
      if (refetchAppointments) refetchAppointments(); else router.refresh();
    }
  }, [cashCollectionData, refetchAppointments, router]);

  useEffect(() => {
    if (rescheduleData?.success) {
      toast.success("Appointment rescheduled successfully");
      setRescheduleOpen(false);
      setSelectedRescheduleSlot(null);
      if (refetchAppointments) refetchAppointments(); else router.refresh();
    }
  }, [rescheduleData, refetchAppointments, router]);

  useEffect(() => {
    if (followUpData?.success) {
      toast.success("Follow-up appointment scheduled successfully (included at ₹0)");
      setFollowUpOpen(false);
      setSelectedFollowUpSlot(null);
      setFollowUpNotes("");
      setFollowUpError(null);
      if (refetchAppointments) refetchAppointments(); else router.refresh();
    }
  }, [followUpData, refetchAppointments, router]);

  useEffect(() => {
    if (followUpSubmitError) {
      setFollowUpError(followUpSubmitError.message || "Failed to schedule follow-up appointment");
    }
  }, [followUpSubmitError]);

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

  const isFollowUpAppointment = Boolean(appointment.originalAppointmentId);
  const followUpEligibility = userRole === "PATIENT"
    ? isOriginalAppointmentEligibleForFollowUp(appointment)
    : { eligible: false };
  const canBookFollowUp = followUpEligibility.eligible;
  const recommendedFollowUpDate = appointment.prescription?.followUpDays
    ? calculateRecommendedFollowUpDate(appointment.startTime, appointment.prescription.followUpDays)
    : null;

  return (
    <>
      <Card className="border-border transition-colors hover:border-primary/40 shadow-none">
        {userRole === "PATIENT" && !isFollowUpAppointment && appointment.status === "PAYMENT_PENDING"
          && appointment.payment?.status === "PENDING"
          && ["ONLINE", "UPI_QR"].includes(appointment.payment.method) && (
            <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" onReady={() => setRazorpayReady(true)} />
          )}
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
                {userRole === "PATIENT" && appointment.prescription?.followUpRequired && (
                  <div className="flex items-center mt-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                    <Calendar className="h-3.5 w-3.5 mr-1.5 text-emerald-600 dark:text-primary shrink-0" />
                    <span>
                      Recommended follow-up: within {appointment.prescription.followUpDays} days
                      {recommendedFollowUpDate ? ` (around ${format(recommendedFollowUpDate, "MMM d, yyyy")})` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 self-end md:self-start items-end">
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {isFollowUpAppointment && (
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-medium"
                  >
                    Follow-up (Included / ₹0)
                  </Badge>
                )}
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
              </div>
              {isFollowUpAppointment ? (
                <div className="text-right text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Follow-up (Included / ₹0)
                </div>
              ) : appointment.payment ? (
                <div className="text-right text-xs text-muted-foreground">
                  <span>{resumeStatusMessage || getAppointmentPaymentLabel(appointment.payment, appointment)}</span>
                  {appointment.payment.cashCollection?.collectedAt && (
                    <span className="mt-0.5 block">Collected {formatDateTime(appointment.payment.cashCollection.collectedAt)}</span>
                  )}
                </div>
              ) : null}
              <div className="flex gap-2 mt-2 flex-wrap justify-end">
                {canBookFollowUp && (
                  <Button
                    size="sm"
                    onClick={openFollowUp}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  >
                    Book Follow-up (Included / ₹0)
                  </Button>
                )}
                {userRole === "PATIENT" && appointment.followUpAppointment && appointment.followUpAppointment.status !== "CANCELLED" && (
                  <Badge variant="outline" className="bg-muted border-border text-xs text-muted-foreground self-center">
                    Follow-up: {appointment.followUpAppointment.status}
                  </Badge>
                )}
                {userRole === "PATIENT" && !isFollowUpAppointment && appointment.status === "PAYMENT_PENDING"
                  && appointment.payment?.status === "PENDING"
                  && ["ONLINE", "UPI_QR"].includes(appointment.payment.method)
                  && !resumeStatusMessage && (
                    <Button size="sm" variant="outline" onClick={handleResumeCheckout} disabled={resumeCheckoutLoading || !razorpayReady}>
                      {resumeCheckoutLoading ? "Checking payment..." : razorpayReady ? "Resume checkout" : "Loading secure checkout..."}
                    </Button>
                  )}
                {userRole === "DOCTOR"
                  && appointment.payment?.method === "CASH"
                  && appointment.payment.status === "CASH_DUE"
                  && ["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(appointment.status) && (
                    <Button size="sm" variant="outline" onClick={handleRecordCashCollection} disabled={cashCollectionLoading}>
                      {cashCollectionLoading ? "Recording..." : "Record cash collection"}
                    </Button>
                  )}
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
              <div className="flex items-center gap-2 flex-wrap">
                {isFollowUpAppointment && (
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-medium"
                  >
                    Follow-up (Included / ₹0)
                  </Badge>
                )}
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
            {appointment.consultationMode !== "OFFLINE" && ["CONFIRMED", "IN_PROGRESS"].includes(appointment.status) && (
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

            {userRole === "PATIENT" && appointment.prescription?.followUpRequired && (
              <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                <h4 className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  Follow-up Recommendation
                </h4>
                <p className="text-sm text-foreground">
                  The doctor recommended a follow-up consultation within <span className="font-semibold">{appointment.prescription.followUpDays} days</span> (included at ₹0).
                </p>
                {recommendedFollowUpDate && (
                  <p className="text-xs text-muted-foreground">
                    Target timeframe: around {format(recommendedFollowUpDate, "MMMM d, yyyy")} (guidance only — select any available slot).
                  </p>
                )}
                {canBookFollowUp && (
                  <div className="pt-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setOpen(false);
                        openFollowUp();
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    >
                      Book Follow-up (Included / ₹0)
                    </Button>
                  </div>
                )}
                {appointment.followUpAppointment && appointment.followUpAppointment.status !== "CANCELLED" && (
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 pt-1">
                    Follow-up consultation is {appointment.followUpAppointment.status.toLowerCase()}.
                  </p>
                )}
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
          <DialogHeader><DialogTitle className="text-foreground font-bold">Reschedule appointment?</DialogTitle><DialogDescription>Select a new available 20-minute slot. Your appointment payment will not change.</DialogDescription></DialogHeader>
          <div className="max-h-80 space-y-4 overflow-y-auto py-2">
            {slotsLoading ? <p className="text-xs text-muted-foreground">Loading available slots...</p> : slotsData?.days?.map((day) => <div key={day.date}><h4 className="mb-2 text-xs font-semibold text-foreground">{day.displayDate}</h4><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{day.slots.map((slot) => <Button key={slot.startTime} variant={selectedRescheduleSlot?.startTime === slot.startTime ? "default" : "outline"} onClick={() => setSelectedRescheduleSlot(slot)}>{formatLocalSlotRange(slot.startTime, slot.endTime)}</Button>)}</div></div>)}
            {!slotsLoading && !slotsData?.days?.some((day) => day.slots.length) && <p className="text-xs text-muted-foreground">No available appointments for these dates.</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setRescheduleOpen(false)}>Cancel</Button><Button onClick={confirmReschedule} disabled={!selectedRescheduleSlot || rescheduleLoading} className="bg-primary text-primary-foreground hover:bg-primary/90">{rescheduleLoading ? "Rescheduling..." : "Confirm Reschedule"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground font-bold">
              Book Follow-up Consultation
            </DialogTitle>
            <DialogDescription>
              Schedule your included follow-up appointment with Dr. {otherParty?.name || "your doctor"}. Included at ₹0.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Recommendation guidance */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 space-y-1">
              <div className="flex items-center text-sm font-semibold text-foreground">
                <Calendar className="mr-2 h-4 w-4 text-primary" />
                Recommended follow-up timeframe: within {appointment.prescription?.followUpDays} days
              </div>
              {recommendedFollowUpDate && (
                <p className="text-xs text-muted-foreground">
                  Target timeframe: around {format(recommendedFollowUpDate, "MMMM d, yyyy")} (Guidance only — select any available slot).
                </p>
              )}
            </div>

            {/* Consultation Mode Selection */}
            {(() => {
              const supportedModes = getDoctorSupportedModes(appointment.doctor);
              return (
                <fieldset className="space-y-2">
                  <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Consultation Mode
                  </legend>
                  {supportedModes.length > 1 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ["ONLINE", "Online Video Consultation"],
                        ["OFFLINE", "In-person Clinic Consultation"],
                      ].filter(([val]) => supportedModes.includes(val)).map(([val, label]) => (
                        <label
                          key={val}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors ${
                            followUpMode === val
                              ? "border-primary bg-primary/5 font-medium text-foreground"
                              : "border-border hover:bg-muted text-muted-foreground"
                          }`}
                        >
                          <input
                            type="radio"
                            name="followUpConsultationMode"
                            value={val}
                            checked={followUpMode === val}
                            onChange={() => setFollowUpMode(val)}
                            className="text-primary focus:ring-primary"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-border p-3 text-sm text-foreground">
                      <span className="font-medium">
                        {supportedModes[0] === "OFFLINE" ? "In-person Clinic Consultation" : "Online Video Consultation"}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">(Doctor supported mode)</span>
                    </div>
                  )}
                </fieldset>
              );
            })()}

            {/* Slot Picker */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Select an Available Slot (20 minutes)
              </h4>
              <div className="max-h-60 space-y-4 overflow-y-auto rounded-lg border border-border p-3">
                {followUpSlotsLoading ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />
                    Loading available slots...
                  </div>
                ) : followUpSlotsData?.days?.some((day) => day.slots.length > 0) ? (
                  followUpSlotsData.days.map((day) =>
                    day.slots.length > 0 ? (
                      <div key={day.date} className="space-y-2">
                        <h5 className="text-xs font-semibold text-foreground">
                          {day.displayDate}
                        </h5>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {day.slots.map((slot) => (
                            <Button
                              key={slot.startTime}
                              type="button"
                              size="sm"
                              variant={
                                selectedFollowUpSlot?.startTime === slot.startTime
                                  ? "default"
                                  : "outline"
                              }
                              className="text-xs h-9 justify-center"
                              onClick={() => setSelectedFollowUpSlot(slot)}
                            >
                              <Clock className="mr-1.5 h-3.5 w-3.5" />
                              {formatLocalSlotRange(slot.startTime, slot.endTime)}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null
                  )
                ) : (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No available appointments for this doctor right now. Please check back later.
                  </div>
                )}
              </div>
            </div>

            {/* Patient Description / Notes */}
            <div className="space-y-2">
              <label htmlFor="followUpNotes" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Reason or symptoms update (Optional)
              </label>
              <Textarea
                id="followUpNotes"
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
                placeholder="Describe any symptoms or reason for this follow-up..."
                maxLength={5000}
                className="text-sm bg-background border-border min-h-[70px]"
              />
            </div>

            {/* Summary / Included ₹0 badge */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center justify-between text-xs">
              <div>
                <span className="font-medium text-foreground">Consultation Fee:</span>
                <span className="ml-2 font-bold text-emerald-700 dark:text-emerald-400">
                  Included (₹0)
                </span>
              </div>
              {selectedFollowUpSlot && (
                <div className="text-muted-foreground">
                  {format(new Date(selectedFollowUpSlot.startTime), "MMM d, h:mm a")}
                </div>
              )}
            </div>

            {/* Server Error Notice */}
            {followUpError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {followUpError}
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFollowUpOpen(false)}
              disabled={followUpLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmitFollowUp}
              disabled={!selectedFollowUpSlot || followUpLoading || followUpSlotsLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {followUpLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scheduling Follow-up...
                </>
              ) : (
                "Confirm Follow-up (₹0)"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
