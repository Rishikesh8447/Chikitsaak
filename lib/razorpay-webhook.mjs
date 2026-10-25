import { verifyRazorpayWebhookSignature } from "./razorpay.mjs";
import { reconcileAppointmentRefundEvent, reconcileCapturedAppointmentPayment, recordIgnoredRazorpayWebhook } from "./appointment-payment-reconciliation.mjs";
import { createAppointmentNotificationPair } from "./notifications.js";

const MAX_WEBHOOK_BODY_BYTES = 1_000_000;

export function createRazorpayWebhookHandler({ db, webhookSecret, mode }) {
  return async function handleRazorpayWebhook(request) {
    if (!(mode === "test" || mode === "live") || !webhookSecret) return Response.json({ error: "Webhook unavailable" }, { status: 503 });
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) return Response.json({ error: "Invalid webhook" }, { status: 413 });

    let rawBody;
    try {
      rawBody = Buffer.from(await request.arrayBuffer());
    } catch {
      return Response.json({ error: "Invalid webhook" }, { status: 400 });
    }
    if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) return Response.json({ error: "Invalid webhook" }, { status: 413 });
    if (!verifyRazorpayWebhookSignature(rawBody, request.headers.get("x-razorpay-signature"), webhookSecret)) {
      return Response.json({ error: "Invalid webhook signature" }, { status: 400 });
    }

    const eventId = request.headers.get("x-razorpay-event-id");
    if (!eventId || eventId.length > 200) return Response.json({ error: "Missing webhook event identifier" }, { status: 400 });

    let body;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
    }
    if (typeof body?.event !== "string" || body.event.length > 120) return Response.json({ error: "Invalid webhook payload" }, { status: 400 });

    const payment = body?.payload?.payment?.entity;
    const refund = body?.payload?.refund?.entity;
    const details = {
      id: eventId,
      type: body.event,
      paymentId: typeof payment?.id === "string" ? payment.id : null,
      orderId: typeof payment?.order_id === "string" ? payment.order_id : null,
      amountPaise: Number.isSafeInteger(payment?.amount) ? payment.amount : null,
      currency: typeof payment?.currency === "string" ? payment.currency : null,
      method: typeof payment?.method === "string" ? payment.method : null,
    };

    try {
      if (body.event === "refund.created" || body.event === "refund.processed") {
        const refundPaymentId = typeof refund?.payment_id === "string" ? refund.payment_id : null;
        const refundAmountPaise = Number.isSafeInteger(refund?.amount) ? refund.amount : null;
        if (!refundPaymentId || !Number.isSafeInteger(refundAmountPaise) || refundAmountPaise <= 0) {
          await recordIgnoredRazorpayWebhook(db, { id: eventId, type: body.event });
          return Response.json({ received: true });
        }
        const result = await reconcileAppointmentRefundEvent({
          db,
          providerPaymentId: refundPaymentId,
          refundAmountPaise,
          event: { id: eventId, type: body.event, paymentId: refundPaymentId, amountPaise: refundAmountPaise },
        });
        return Response.json({ received: true, result });
      }
      if (body.event !== "payment.captured" || payment?.status !== "captured" || payment?.captured !== true) {
        await recordIgnoredRazorpayWebhook(db, details);
        return Response.json({ received: true });
      }
      if (!details.paymentId || !details.orderId || !Number.isSafeInteger(details.amountPaise) || !details.currency) {
        return Response.json({ error: "Incomplete captured payment event" }, { status: 400 });
      }

      const result = await reconcileCapturedAppointmentPayment({
        db,
        ...details,
        event: details,
        notify: (tx, appointment) => createAppointmentNotificationPair(tx, appointment, {
          type: "APPOINTMENT_BOOKED",
          title: "Appointment booked",
          patientMessage: "Your paid appointment request was booked.",
          doctorMessage: "You have a new paid appointment request.",
          key: `appointment:${appointment.id}:booked`,
        }),
      });
      return Response.json({ received: true, result });
    } catch {
      return Response.json({ error: "Webhook processing failed" }, { status: 500 });
    }
  };
}
