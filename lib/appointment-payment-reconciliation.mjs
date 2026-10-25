import { flagPaymentPayoutsForReview } from "./payment-payouts.mjs";

const ACTIVE_APPOINTMENT_STATUSES = ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"];
const CAPTURED_PAYMENT_STATUSES = ["PENDING", "EXPIRED", "FAILED"];
const REVIEWABLE_REFUND_STATUSES = ["NOT_REQUIRED", "REVIEW_REQUIRED"];

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function withSerializableRetries(operation, { attempts = 3, delay = wait } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (error?.code !== "P2034" || attempt >= attempts) throw error;
      await delay(20 * attempt);
    }
  }
}

function isWithinAvailability(windows, startTime, endTime) {
  const minutes = (value) => value.getHours() * 60 + value.getMinutes();
  return windows.some((window) =>
    (window.dayOfWeek === null || window.dayOfWeek === startTime.getDay())
    && (!window.blockedDate || new Date(window.blockedDate).toDateString() !== startTime.toDateString())
    && minutes(window.startTime) <= minutes(startTime)
    && minutes(window.endTime) >= minutes(endTime)
  );
}

function markSerializationConflict() {
  return Object.assign(new Error("Serializable payment update conflicted"), { code: "P2034" });
}

async function createWebhookReceipt(tx, event) {
  if (!event?.id) return false;
  const existing = await tx.razorpayWebhookEvent.findUnique({ where: { id: event.id } });
  if (existing) return true;
  await tx.razorpayWebhookEvent.create({ data: {
    id: event.id,
    eventType: event.type,
    razorpayPaymentId: event.paymentId || null,
    razorpayOrderId: event.orderId || null,
    amountPaise: Number.isSafeInteger(event.amountPaise) ? event.amountPaise : null,
    currency: typeof event.currency === "string" ? event.currency : null,
    status: "RECEIVED",
  } });
  return false;
}

async function finishWebhookReceipt(tx, event, status, appointmentPaymentId = null) {
  if (!event?.id) return;
  await tx.razorpayWebhookEvent.update({
    where: { id: event.id },
    data: { status, processedAt: new Date(), appointmentPaymentId },
  });
}

async function releaseUnconfirmableHold(tx, appointment) {
  if (appointment?.status !== "PAYMENT_PENDING") return;
  await tx.appointment.updateMany({
    where: { id: appointment.id, status: "PAYMENT_PENDING" },
    data: { status: "CANCELLED", checkoutExpiresAt: null },
  });
}

async function captureAsReview(tx, payment, details, event) {
  if (payment.status === "PAID") {
    await tx.appointmentPayment.updateMany({
      where: { id: payment.id, status: "PAID", refundStatus: { in: REVIEWABLE_REFUND_STATUSES } },
      data: { refundStatus: "REVIEW_REQUIRED" },
    });
  } else {
    const changed = await tx.appointmentPayment.updateMany({
      where: { id: payment.id, status: { in: CAPTURED_PAYMENT_STATUSES } },
      data: {
        status: "PAID",
        orderStatus: "PAID",
        refundStatus: "REVIEW_REQUIRED",
        razorpayPaymentId: details.paymentId,
        verifiedAt: new Date(),
      },
    });
    if (changed.count !== 1) throw markSerializationConflict();
  }
  await flagPaymentPayoutsForReview(tx, payment.id, "Appointment payment entered refund review");
  await tx.appointment.updateMany({
    where: { id: payment.appointment.id, status: "PAYMENT_PENDING" },
    data: { status: "CANCELLED", checkoutExpiresAt: null },
  });
  await finishWebhookReceipt(tx, event, "REVIEW_REQUIRED", payment.id);
  return "REVIEW_REQUIRED";
}

async function reconcileInTransaction(tx, details, { notify }) {
  const payment = await tx.appointmentPayment.findUnique({
    where: { razorpayOrderId: details.orderId },
    include: { appointment: true },
  });
  if (!payment) {
    await finishWebhookReceipt(tx, details.event, "IGNORED");
    return "IGNORED";
  }

  const amountMatches = details.amountPaise === payment.amountPaise && details.currency === payment.currency && details.currency === "INR";
  const paymentMethodMatches = payment.method !== "UPI_QR" || details.method === "upi";
  if (!amountMatches || !paymentMethodMatches) return captureAsReview(tx, payment, details, details.event);

  if (payment.status === "PAID") {
    if (payment.razorpayPaymentId !== details.paymentId) {
      await tx.appointmentPayment.updateMany({
        where: { id: payment.id, status: "PAID", refundStatus: { in: REVIEWABLE_REFUND_STATUSES } },
        data: { refundStatus: "REVIEW_REQUIRED" },
      });
      await flagPaymentPayoutsForReview(tx, payment.id, "Duplicate or mismatched payment event requires refund review");
      await finishWebhookReceipt(tx, details.event, "REVIEW_REQUIRED", payment.id);
      return "REVIEW_REQUIRED";
    }
    if (payment.appointment.status === "CANCELLED" || payment.appointment.status === "PAYMENT_PENDING") {
      await tx.appointmentPayment.updateMany({
        where: { id: payment.id, status: "PAID", refundStatus: { in: REVIEWABLE_REFUND_STATUSES } },
        data: { refundStatus: "REVIEW_REQUIRED" },
      });
      await flagPaymentPayoutsForReview(tx, payment.id, "Appointment payment cannot be confirmed and requires refund review");
      await releaseUnconfirmableHold(tx, payment.appointment);
      await finishWebhookReceipt(tx, details.event, "REVIEW_REQUIRED", payment.id);
      return "REVIEW_REQUIRED";
    }
    await finishWebhookReceipt(tx, details.event, "PROCESSED", payment.id);
    return "ALREADY_PAID";
  }

  if (!CAPTURED_PAYMENT_STATUSES.includes(payment.status)) {
    await finishWebhookReceipt(tx, details.event, "IGNORED", payment.id);
    return "IGNORED";
  }

  const appointment = payment.appointment;
  const now = new Date();
  let slotStillValid = appointment.status === "PAYMENT_PENDING" && appointment.checkoutExpiresAt > now;
  if (slotStillValid) {
    const windows = await tx.availability.findMany({ where: { doctorId: appointment.doctorId, status: "AVAILABLE" } });
    slotStillValid = isWithinAvailability(windows, appointment.startTime, appointment.endTime);
  }
  if (slotStillValid) {
    const overlap = { startTime: { lt: appointment.endTime }, endTime: { gt: appointment.startTime }, id: { not: appointment.id } };
    const conflict = await tx.appointment.findFirst({ where: {
      ...overlap,
      OR: [
        { doctorId: appointment.doctorId, status: { in: ACTIVE_APPOINTMENT_STATUSES } },
        { patientId: appointment.patientId, status: { in: ACTIVE_APPOINTMENT_STATUSES } },
        { status: "PAYMENT_PENDING", checkoutExpiresAt: { gt: now }, OR: [{ doctorId: appointment.doctorId }, { patientId: appointment.patientId }] },
      ],
    } });
    slotStillValid = !conflict;
  }

  const changed = await tx.appointmentPayment.updateMany({
    where: { id: payment.id, status: { in: CAPTURED_PAYMENT_STATUSES } },
    data: {
      status: "PAID",
      orderStatus: "PAID",
      refundStatus: slotStillValid ? "NOT_REQUIRED" : "REVIEW_REQUIRED",
      razorpayPaymentId: details.paymentId,
      verifiedAt: now,
    },
  });
  if (changed.count !== 1) throw markSerializationConflict();

  if (!slotStillValid) {
    await flagPaymentPayoutsForReview(tx, payment.id, "Captured payment requires refund review");
    await tx.appointment.updateMany({ where: { id: appointment.id, status: "PAYMENT_PENDING" }, data: { status: "CANCELLED", checkoutExpiresAt: null } });
    await finishWebhookReceipt(tx, details.event, "REVIEW_REQUIRED", payment.id);
    return "REVIEW_REQUIRED";
  }

  const confirmed = await tx.appointment.updateMany({
    where: { id: appointment.id, status: "PAYMENT_PENDING", checkoutExpiresAt: { gt: now } },
    data: { status: "SCHEDULED", checkoutExpiresAt: null },
  });
  if (confirmed.count !== 1) throw markSerializationConflict();
  await notify(tx, { ...appointment, status: "SCHEDULED" });
  await finishWebhookReceipt(tx, details.event, "PROCESSED", payment.id);
  return "PAID";
}

async function recoverCapturedPaymentAsReview(db, details) {
  return db.$transaction(async (tx) => {
    if (details.event && await createWebhookReceipt(tx, details.event)) return "DUPLICATE_EVENT";
    const payment = await tx.appointmentPayment.findUnique({ where: { razorpayOrderId: details.orderId }, include: { appointment: true } });
    if (!payment) {
      await finishWebhookReceipt(tx, details.event, "IGNORED");
      return "IGNORED";
    }
    if (payment.status === "PAID") {
      const outcome = payment.razorpayPaymentId === details.paymentId && payment.appointment.status !== "CANCELLED"
        ? "ALREADY_PAID"
        : "REVIEW_REQUIRED";
      if (outcome === "REVIEW_REQUIRED") {
        await tx.appointmentPayment.updateMany({
          where: { id: payment.id, status: "PAID", refundStatus: { in: REVIEWABLE_REFUND_STATUSES } },
          data: { refundStatus: "REVIEW_REQUIRED" },
        });
        await flagPaymentPayoutsForReview(tx, payment.id, "Captured payment requires refund review");
        await releaseUnconfirmableHold(tx, payment.appointment);
      }
      await finishWebhookReceipt(tx, details.event, outcome === "ALREADY_PAID" ? "PROCESSED" : "REVIEW_REQUIRED", payment.id);
      return outcome;
    }
    const changed = await tx.appointmentPayment.updateMany({
      where: { id: payment.id, status: { in: CAPTURED_PAYMENT_STATUSES } },
      data: { status: "PAID", orderStatus: "PAID", refundStatus: "REVIEW_REQUIRED", razorpayPaymentId: details.paymentId, verifiedAt: new Date() },
    });
    if (changed.count !== 1) throw markSerializationConflict();
    await flagPaymentPayoutsForReview(tx, payment.id, "Captured payment requires refund review");
    await tx.appointment.updateMany({ where: { id: payment.appointment.id, status: "PAYMENT_PENDING" }, data: { status: "CANCELLED", checkoutExpiresAt: null } });
    await finishWebhookReceipt(tx, details.event, "REVIEW_REQUIRED", payment.id);
    return "REVIEW_REQUIRED";
  });
}

async function findDuplicateEvent(db, event) {
  if (!event?.id) return null;
  return db.razorpayWebhookEvent.findUnique({ where: { id: event.id } });
}

export async function recordIgnoredRazorpayWebhook(db, event) {
  try {
    return await withSerializableRetries(() => db.$transaction(async (tx) => {
      if (await createWebhookReceipt(tx, event)) return "DUPLICATE_EVENT";
      await finishWebhookReceipt(tx, event, "IGNORED");
      return "IGNORED";
    }, { isolationLevel: "Serializable" }));
  } catch (error) {
    if (error?.code === "P2002" && await findDuplicateEvent(db, event)) return "DUPLICATE_EVENT";
    throw error;
  }
}

export async function reconcileCapturedAppointmentPayment({ db, orderId, paymentId, amountPaise, currency, method, event, notify }) {
  const details = { orderId, paymentId, amountPaise, currency, method, event };
  try {
    return await withSerializableRetries(() => db.$transaction(async (tx) => {
      if (event && await createWebhookReceipt(tx, event)) return "DUPLICATE_EVENT";
      return reconcileInTransaction(tx, details, { notify });
    }, { isolationLevel: "Serializable", timeout: 15000 }));
  } catch (error) {
    if (error?.code === "P2002" && event && await findDuplicateEvent(db, event)) return "DUPLICATE_EVENT";
    if (error?.code !== "P2034") throw error;
    return recoverCapturedPaymentAsReview(db, details);
  }
}

/** Consume a verified Razorpay refund event. This records the provider event and flags related payouts for review; it never initiates a refund or reverses a transfer. */
export async function reconcileAppointmentRefundEvent({ db, providerPaymentId, refundAmountPaise, event }) {
  if (!providerPaymentId || !event?.id || !Number.isSafeInteger(refundAmountPaise) || refundAmountPaise <= 0) {
    throw new Error("Invalid refund event details");
  }
  try {
    return await withSerializableRetries(() => db.$transaction(async (tx) => {
      if (await createWebhookReceipt(tx, event)) return "DUPLICATE_EVENT";
      const payment = await tx.appointmentPayment.findUnique({ where: { razorpayPaymentId: providerPaymentId } });
      if (!payment || payment.status !== "PAID") {
        await finishWebhookReceipt(tx, event, "IGNORED");
        return "IGNORED";
      }
      const fullRefund = refundAmountPaise >= payment.amountPaise && event.type === "refund.processed";
      const refundStatus = fullRefund ? "REFUNDED" : "REVIEW_REQUIRED";
      const changed = await tx.appointmentPayment.updateMany({
        where: { id: payment.id, status: "PAID", refundStatus: { not: "REFUNDED" } },
        data: { refundStatus },
      });
      if (changed.count !== 1 && payment.refundStatus !== "REFUNDED") throw markSerializationConflict();
      await flagPaymentPayoutsForReview(tx, payment.id, fullRefund ? "Provider reported a completed refund after collection" : "Provider refund event requires review");
      await finishWebhookReceipt(tx, event, "REVIEW_REQUIRED", payment.id);
      return fullRefund ? "REFUNDED_REVIEW_REQUIRED" : "REFUND_REVIEW_REQUIRED";
    }, { isolationLevel: "Serializable" }));
  } catch (error) {
    if (error?.code === "P2002" && await findDuplicateEvent(db, event)) return "DUPLICATE_EVENT";
    throw error;
  }
}
