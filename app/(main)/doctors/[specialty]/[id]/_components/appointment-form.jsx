"use client";

import { useState } from "react";
import Script from "next/script";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Loader2, Clock, ArrowLeft, Calendar, CreditCard } from "lucide-react";
import { createOfflineAppointmentCheckout, createOnlineAppointmentCheckout, verifyOnlineAppointmentPayment } from "@/actions/payments";
import { toast } from "sonner";
import { AiPreconsultation } from "@/components/ai-preconsultation";
import { formatLocalSlotRange } from "@/lib/appointment-time.mjs";

export function AppointmentForm({ doctorId, slot, priceRupees, onBack, onComplete }) {
  const [description, setDescription] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [aiSpecialtySuggestion, setAiSpecialtySuggestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [activeCheckout, setActiveCheckout] = useState(null);
  const [consultationMode, setConsultationMode] = useState("ONLINE");
  const [offlinePaymentMethod, setOfflinePaymentMethod] = useState("CASH");

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

    const selectedPaymentMethod = consultationMode === "ONLINE" ? "ONLINE" : offlinePaymentMethod;
    if (selectedPaymentMethod === "UPI_QR" && !razorpayReady) {
      toast.error("Secure checkout is still loading. Please try again shortly.");
      return;
    }
    setLoading(true);
    try {
      let checkout = activeCheckout;
      if (selectedPaymentMethod === "CASH") {
        const result = await createOfflineAppointmentCheckout(formData, "CASH");
        if (!result?.success) {
          toast.error(result?.message || "Unable to book this appointment.");
          return;
        }
        toast.success("Appointment booked. Cash payment is due at the consultation.");
        onComplete();
        return;
      }
      if (!checkout || new Date(checkout.holdExpiresAt) <= new Date()) {
        checkout = consultationMode === "ONLINE"
          ? await createOnlineAppointmentCheckout(formData)
          : await createOfflineAppointmentCheckout(formData, "UPI_QR");
        if (!checkout?.success) {
          setActiveCheckout(null);
          toast.error(checkout?.message || "Unable to start checkout.");
          return;
        }
        setActiveCheckout(checkout);
      }
      if (typeof window.Razorpay !== "function") {
        toast.error("Secure checkout is still loading. Please try again.");
        return;
      }
      const razorpay = new window.Razorpay({
        key: checkout.keyId,
        order_id: checkout.orderId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: "Chikitsaak",
        description: consultationMode === "OFFLINE" ? "In-person doctor consultation" : "Online doctor consultation",
        theme: { color: "#0f766e" },
        ...(selectedPaymentMethod === "UPI_QR" ? {
          config: {
            display: {
              blocks: { upi: { name: "UPI / QR", instruments: [{ method: "upi" }] } },
              sequence: ["block.upi"],
              preferences: { show_default_blocks: false },
            },
          },
        } : {}),
        modal: { escape: true },
        handler: async (response) => {
          const result = await verifyOnlineAppointmentPayment({
            appointmentId: checkout.appointmentId,
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          if (result?.success) {
            setActiveCheckout(null);
            toast.success("Payment verified and appointment request booked.");
            onComplete();
          } else {
            if (["REFUND_REVIEW_REQUIRED", "PAYMENT_RECONCILIATION_PENDING"].includes(result?.code)) {
              setActiveCheckout(null);
              onComplete();
            }
            toast.error(result?.message || "Payment could not be verified.");
          }
        },
      });
      razorpay.on("payment.failed", () => toast.error("Payment was not completed. Your slot hold will expire in 15 minutes."));
      razorpay.open();
    } catch {
      toast.error("Unable to start secure checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {(consultationMode === "ONLINE" || offlinePaymentMethod === "UPI_QR") && (
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" onReady={() => setRazorpayReady(true)} />
      )}
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
            Appointment cost: <span className="font-semibold text-foreground">{Number.isInteger(priceRupees) ? `₹${priceRupees}` : "Price unavailable"}</span>
          </span>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">Consultation type</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {[["ONLINE", "Online consultation"], ["OFFLINE", "In-person consultation"]].map(([value, label]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-3 text-sm">
              <input type="radio" name="consultationMode" value={value} checked={consultationMode === value} onChange={() => { setConsultationMode(value); setActiveCheckout(null); }} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {consultationMode === "OFFLINE" && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-foreground">Payment method</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {[["CASH", "Cash at consultation"], ["UPI_QR", "Razorpay UPI / QR"]].map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-3 text-sm">
                <input type="radio" name="offlinePaymentMethod" value={value} checked={offlinePaymentMethod === value} onChange={() => { setOfflinePaymentMethod(value); setActiveCheckout(null); }} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {offlinePaymentMethod === "CASH" && <p className="text-sm text-muted-foreground">Cash will remain due until it is collected; selecting cash does not record a payment.</p>}
        </fieldset>
      )}

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
          disabled={loading || (consultationMode === "ONLINE" || offlinePaymentMethod === "UPI_QR") && !razorpayReady}
          className="min-h-11 w-full sm:min-w-40 sm:w-auto"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Booking...
            </>
          ) : (
            (consultationMode === "ONLINE" || offlinePaymentMethod === "UPI_QR") && !razorpayReady ? "Loading secure checkout..." : consultationMode === "OFFLINE" && offlinePaymentMethod === "CASH" ? "Book with cash due" : activeCheckout ? "Continue checkout" : "Pay and Book"
          )}
        </Button>
      </div>
    </form>
  );
}
