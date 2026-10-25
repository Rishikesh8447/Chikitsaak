"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { addMinutes } from "date-fns";
import { db } from "@/lib/prisma";
import { createAppointmentNotificationPair } from "@/lib/notifications";
import { rupeesToPaise, verifyRazorpayPaymentSignature } from "@/lib/razorpay.mjs";
import { getRazorpayApiConfig } from "@/lib/razorpay-config.mjs";
import { reconcileCapturedAppointmentPayment, withSerializableRetries } from "@/lib/appointment-payment-reconciliation.mjs";

const ACTIVE_APPOINTMENT_STATUSES = ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"];
const SAFE_PAYMENT_ERROR_CODES = new Set([
  "AUTHENTICATION_ERROR", "BAD_REQUEST_ERROR", "GATEWAY_ERROR", "SERVER_ERROR",
  "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED",
  "CONFIG_MODE_INVALID", "CONFIG_KEY_ID_MISSING", "CONFIG_KEY_MODE_MISMATCH",
  "CONFIG_KEY_SECRET_MISSING",
]);

function paymentDiagnostic(error, fallbackCode) {
  const candidateCode = error?.diagnosticCode || error?.providerCode || error?.code;
  const errorCode = error?.httpStatus === 401
    ? "AUTHENTICATION_FAILED"
    : SAFE_PAYMENT_ERROR_CODES.has(candidateCode)
      ? candidateCode
      : error?.name === "TimeoutError"
        ? "REQUEST_TIMEOUT"
        : error?.name === "TypeError" && fallbackCode === "PROVIDER_REQUEST_FAILED"
          ? "NETWORK_ERROR"
          : fallbackCode;
  const providerCode = SAFE_PAYMENT_ERROR_CODES.has(error?.providerCode) ? error.providerCode : null;
  const httpStatus = Number.isInteger(error?.httpStatus) && error.httpStatus >= 100 && error.httpStatus <= 599
    ? error.httpStatus
    : null;
  const descriptions = {
    AUTHENTICATION_ERROR: "Razorpay rejected the configured API key pair.",
    AUTHENTICATION_FAILED: "Razorpay did not authenticate the configured API key pair.",
    BAD_REQUEST_ERROR: "Razorpay rejected the order request.",
    GATEWAY_ERROR: "Razorpay reported a gateway error.",
    SERVER_ERROR: "Razorpay reported a server error.",
    ECONNRESET: "The connection to Razorpay was interrupted.",
    ETIMEDOUT: "The Razorpay request timed out.",
    ENOTFOUND: "The Razorpay host could not be resolved.",
    EAI_AGAIN: "The Razorpay host lookup temporarily failed.",
    ECONNREFUSED: "The Razorpay connection was refused.",
    CONFIG_MODE_INVALID: "Razorpay mode must be set to test or live.",
    CONFIG_KEY_ID_MISSING: "The Razorpay API key ID is not configured.",
    CONFIG_KEY_MODE_MISMATCH: "The Razorpay API key ID does not match the selected mode.",
    CONFIG_KEY_SECRET_MISSING: "The Razorpay API key secret is not configured.",
    REQUEST_TIMEOUT: "The Razorpay request timed out.",
    NETWORK_ERROR: "The connection to Razorpay could not be completed.",
    CONFIGURATION_INVALID: "Razorpay API credentials are missing or invalid for the selected mode.",
    INVALID_ORDER_RESPONSE: "Razorpay returned an order that did not match the requested amount or currency.",
    ORDER_PERSISTENCE_FAILED: "The Razorpay order could not be saved for the appointment.",
    PROVIDER_REQUEST_FAILED: "The Razorpay order request failed.",
    CHECKOUT_PERSISTENCE_FAILED: "Appointment checkout could not be saved.",
  };
  return {
    errorCode,
    providerCode,
    httpStatus,
    description: descriptions[errorCode] || "The payment request could not be completed.",
  };
}

function logPaymentDiagnostic(error, fallbackCode) {
  console.error("Razorpay checkout diagnostic", paymentDiagnostic(error, fallbackCode));
}

function basicAuth(keyId, keySecret) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function providerRequest(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    let providerCode;
    try {
      const body = await response.json();
      if (SAFE_PAYMENT_ERROR_CODES.has(body?.error?.code)) providerCode = body.error.code;
    } catch {
      // The status alone is sufficient for a safe diagnostic.
    }
    throw Object.assign(new Error("Payment provider request failed"), {
      providerCode,
      httpStatus: response.status,
    });
  }
  return response.json();
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

function checkoutError(code, message) {
  return Object.assign(new Error(message), { checkoutError: true, code });
}

/** Persist the requested appointment/payment state, creating a provider order only for paid flows. */
async function createAppointmentCheckout(formData, consultationMode, paymentMethod) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  let credentials = null;
  if (paymentMethod !== "CASH") {
    try {
      credentials = getRazorpayApiConfig();
    } catch (error) {
      logPaymentDiagnostic(error, "CONFIGURATION_INVALID");
      return { success: false, code: "PAYMENT_SERVICE_UNAVAILABLE", message: "Online payments are temporarily unavailable." };
    }
  }
  const { keyId, keySecret } = credentials || {};

  const doctorId = formData.get("doctorId");
  const startValue = formData.get("startTime");
  const endValue = formData.get("endTime");
  const startTime = new Date(startValue);
  const endTime = new Date(endValue);
  const patientDescription = formData.get("description") || null;
  const aiSummary = formData.get("aiSummary");
  const aiSpecialtySuggestion = formData.get("aiSpecialtySuggestion");
  if (typeof doctorId !== "string" || !startValue || !endValue || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return { success: false, code: "INVALID_APPOINTMENT", message: "Appointment details are invalid. Please select a new time." };
  }
  if (endTime <= startTime || startTime <= new Date() || endTime - startTime !== 20 * 60 * 1000) {
    return { success: false, code: "INVALID_APPOINTMENT", message: "Choose a future 20-minute appointment slot." };
  }
  if (typeof patientDescription === "string" && patientDescription.length > 5000) return { success: false, code: "INVALID_APPOINTMENT", message: "Appointment details are too long." };
  if (aiSummary !== null && (typeof aiSummary !== "string" || aiSummary.length > 5000)) return { success: false, code: "INVALID_APPOINTMENT", message: "Appointment details are invalid." };
  if (aiSpecialtySuggestion !== null && (typeof aiSpecialtySuggestion !== "string" || aiSpecialtySuggestion.length > 120)) return { success: false, code: "INVALID_APPOINTMENT", message: "Appointment details are invalid." };

  const now = new Date();
  const holdExpiresAt = paymentMethod === "CASH" ? null : addMinutes(now, 15);
  let checkout;
  try {
    checkout = await withSerializableRetries(() => db.$transaction(async (tx) => {
      const patient = await tx.user.findUnique({ where: { clerkUserId: userId, role: "PATIENT" }, select: { id: true } });
      const doctor = await tx.user.findUnique({ where: { id: doctorId, role: "DOCTOR", verificationStatus: "VERIFIED" }, select: { id: true, consultationPriceRupees: true } });
      if (!patient) throw checkoutError("PATIENT_NOT_FOUND", "Your patient account could not be found. Please sign in again.");
      if (!doctor) throw checkoutError("DOCTOR_UNAVAILABLE", "This doctor is not currently available for booking.");
      if (!Number.isSafeInteger(doctor.consultationPriceRupees) || doctor.consultationPriceRupees < 1 || doctor.consultationPriceRupees > 100000) {
        throw checkoutError("DOCTOR_PRICE_UNAVAILABLE", "This doctor has not set a valid consultation price.");
      }
      const windows = await tx.availability.findMany({ where: { doctorId, status: "AVAILABLE" } });
      if (!isWithinAvailability(windows, startTime, endTime)) throw checkoutError("SLOT_UNAVAILABLE", "The selected time is no longer available. Please choose another slot.");
      const expiredHolds = await tx.appointment.findMany({ where: { doctorId, status: "PAYMENT_PENDING", checkoutExpiresAt: { lte: now } }, select: { id: true } });
      if (expiredHolds.length) {
        const expiredIds = expiredHolds.map((hold) => hold.id);
        await tx.appointmentPayment.updateMany({ where: { appointmentId: { in: expiredIds }, status: "PENDING" }, data: { status: "EXPIRED", orderStatus: "EXPIRED" } });
        await tx.appointment.updateMany({ where: { id: { in: expiredIds }, status: "PAYMENT_PENDING" }, data: { status: "CANCELLED", checkoutExpiresAt: null } });
      }
      const overlap = { startTime: { lt: endTime }, endTime: { gt: startTime } };
      const activeHoldOrBooking = {
        OR: [
          { status: { in: ACTIVE_APPOINTMENT_STATUSES } },
          { status: "PAYMENT_PENDING", checkoutExpiresAt: { gt: now } },
        ],
      };
      const doctorConflict = await tx.appointment.findFirst({ where: { doctorId, ...overlap, ...activeHoldOrBooking } });
      const patientConflict = await tx.appointment.findFirst({ where: { patientId: patient.id, ...overlap, ...activeHoldOrBooking } });
      if (doctorConflict) throw checkoutError("SLOT_UNAVAILABLE", "This time slot is being checked out or was just booked. Please choose another slot.");
      if (patientConflict) throw checkoutError("PATIENT_CONFLICT", "You already have an appointment at this time.");

      const amountRupees = doctor.consultationPriceRupees;
      const amountPaise = rupeesToPaise(amountRupees);
      const appointment = await tx.appointment.create({ data: {
        patientId: patient.id,
        doctorId,
        startTime,
        endTime,
        patientDescription,
        aiSummary: typeof aiSummary === "string" && aiSummary.trim() ? aiSummary.trim() : null,
        aiSpecialtySuggestion: typeof aiSpecialtySuggestion === "string" && aiSpecialtySuggestion.trim() ? aiSpecialtySuggestion.trim() : null,
        status: paymentMethod === "CASH" ? "SCHEDULED" : "PAYMENT_PENDING",
        checkoutExpiresAt: holdExpiresAt,
        consultationMode,
      } });
      const payment = await tx.appointmentPayment.create({ data: {
        appointmentId: appointment.id,
        amountRupees,
        amountPaise,
        method: paymentMethod,
        status: paymentMethod === "CASH" ? "CASH_DUE" : "PENDING",
        orderStatus: paymentMethod === "CASH" ? "NOT_APPLICABLE" : "CREATED",
      } });
      if (paymentMethod === "CASH") {
        await createAppointmentNotificationPair(tx, { ...appointment, status: "SCHEDULED" }, {
          type: "APPOINTMENT_BOOKED",
          title: "Appointment booked",
          patientMessage: "Your in-person appointment is booked. Cash payment is due at the consultation.",
          doctorMessage: "You have a new in-person appointment. Cash payment is due at the consultation.",
          key: `appointment:${appointment.id}:booked`,
        });
      }
      return { appointmentId: appointment.id, paymentId: payment.id, amountRupees, amountPaise };
    }, { isolationLevel: "Serializable", timeout: 15000 }));
  } catch (error) {
    if (error?.checkoutError) return { success: false, code: error.code, message: error.message };
    if (error?.code === "P2034") return { success: false, code: "SLOT_UNAVAILABLE", message: "This time slot was just booked or changed. Please refresh and choose another slot." };
    logPaymentDiagnostic(error, "CHECKOUT_PERSISTENCE_FAILED");
    return { success: false, code: "CHECKOUT_UNAVAILABLE", message: "Unable to start checkout. Please try again." };
  }

  if (paymentMethod === "CASH") {
    revalidatePath("/appointments");
    revalidatePath("/doctor");
    return { success: true, code: "CASH_DUE", appointmentId: checkout.appointmentId, amountRupees: checkout.amountRupees };
  }

  let orderCreated = false;
  try {
    const order = await providerRequest("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: basicAuth(keyId, keySecret), "Content-Type": "application/json" },
      body: JSON.stringify({ amount: checkout.amountPaise, currency: "INR", receipt: checkout.appointmentId, notes: { appointmentId: checkout.appointmentId } }),
    });
    if (typeof order.id !== "string" || order.receipt !== checkout.appointmentId || order.amount !== checkout.amountPaise || order.currency !== "INR") {
      throw Object.assign(new Error("Invalid payment order"), { diagnosticCode: "INVALID_ORDER_RESPONSE" });
    }
    orderCreated = true;
    await db.appointmentPayment.update({ where: { id: checkout.paymentId, status: "PENDING" }, data: { razorpayOrderId: order.id } });
    return {
      success: true,
      appointmentId: checkout.appointmentId,
      orderId: order.id,
      keyId,
      amount: checkout.amountPaise,
      currency: "INR",
      amountRupees: checkout.amountRupees,
      holdExpiresAt: holdExpiresAt.toISOString(),
    };
  } catch (error) {
    logPaymentDiagnostic(error, error?.diagnosticCode || (orderCreated ? "ORDER_PERSISTENCE_FAILED" : "PROVIDER_REQUEST_FAILED"));
    await db.$transaction(async (tx) => {
      await tx.appointmentPayment.updateMany({ where: { id: checkout.paymentId, status: "PENDING" }, data: { status: "FAILED", orderStatus: "EXPIRED" } });
      await tx.appointment.updateMany({ where: { id: checkout.appointmentId, status: "PAYMENT_PENDING" }, data: { status: "CANCELLED", checkoutExpiresAt: null } });
    });
    return { success: false, code: "CHECKOUT_UNAVAILABLE", message: "Unable to start checkout. Please try again." };
  }
}

export async function createOnlineAppointmentCheckout(formData) {
  return createAppointmentCheckout(formData, "ONLINE", "ONLINE");
}

export async function createOfflineAppointmentCheckout(formData, paymentMethod) {
  if (paymentMethod !== "CASH" && paymentMethod !== "UPI_QR") {
    return { success: false, code: "INVALID_PAYMENT_METHOD", message: "Choose cash or Razorpay UPI for an offline appointment." };
  }
  return createAppointmentCheckout(formData, "OFFLINE", paymentMethod);
}

/** Return an existing owned checkout only while its payment and appointment hold remain payable. */
export async function resumePendingAppointmentCheckout(appointmentId) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  if (typeof appointmentId !== "string" || !appointmentId) {
    return { success: false, code: "INVALID_APPOINTMENT", message: "This checkout cannot be resumed. Choose an appointment again." };
  }

  const patient = await db.user.findUnique({
    where: { clerkUserId: userId, role: "PATIENT" },
    select: { id: true },
  });
  if (!patient) throw new Error("Patient not found");
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId, patientId: patient.id },
    include: { payment: true },
  });
  if (!appointment) return { success: false, code: "APPOINTMENT_NOT_FOUND", message: "This appointment is unavailable." };

  const payment = appointment.payment;
  if (payment?.status === "PAID") {
    return payment.refundStatus === "REVIEW_REQUIRED"
      ? { success: false, code: "REFUND_REVIEW_REQUIRED", message: "Payment was received and is under admin review. Do not pay again; check your appointment status." }
      : appointment.status === "PAYMENT_PENDING"
        ? { success: false, code: "PAYMENT_PROCESSING", message: "Payment was received and appointment confirmation is pending. Do not pay again; refresh your appointments shortly." }
      : { success: false, code: "ALREADY_PAID", message: "This appointment is already paid. Check your appointment status." };
  }
  if (!payment || !["PENDING", "EXPIRED", "FAILED"].includes(payment.status)
    || payment.refundStatus !== "NOT_REQUIRED" || payment.verifiedAt
    || !payment.razorpayOrderId
    || !((appointment.consultationMode === "ONLINE" && payment.method === "ONLINE")
      || (appointment.consultationMode === "OFFLINE" && payment.method === "UPI_QR"))) {
    return { success: false, code: "CHECKOUT_NOT_RESUMABLE", message: "This checkout is no longer payable. Return to the doctor's profile and choose another available slot." };
  }
  if (!Number.isSafeInteger(payment.amountRupees) || payment.amountRupees < 1
    || payment.amountPaise !== rupeesToPaise(payment.amountRupees) || payment.currency !== "INR") {
    return { success: false, code: "CHECKOUT_NOT_RESUMABLE", message: "This checkout cannot be verified safely. Contact support before trying to pay again." };
  }

  let credentials;
  try {
    credentials = getRazorpayApiConfig();
  } catch {
    return { success: false, code: "PAYMENT_SERVICE_UNAVAILABLE", message: "Payment status cannot be checked right now. Do not pay again; try again later." };
  }
  let providerOrder;
  try {
    providerOrder = await providerRequest(`https://api.razorpay.com/v1/orders/${encodeURIComponent(payment.razorpayOrderId)}`, {
      headers: { Authorization: basicAuth(credentials.keyId, credentials.keySecret) },
    });
  } catch {
    return { success: false, code: "PAYMENT_STATUS_UNAVAILABLE", message: "Payment status cannot be checked right now. Do not pay again; try again later." };
  }

  if (providerOrder.id !== payment.razorpayOrderId || providerOrder.receipt !== appointment.id
    || providerOrder.amount !== payment.amountPaise || providerOrder.currency !== payment.currency) {
    return { success: false, code: "CHECKOUT_NOT_RESUMABLE", message: "This checkout could not be matched safely. Contact support before trying to pay again." };
  }
  if (providerOrder.status === "paid" || providerOrder.amount_paid > 0) {
    return { success: false, code: "PAYMENT_PROCESSING", message: "Payment may already have been received and is being confirmed. Do not pay again; refresh your appointments shortly." };
  }
  const activeHold = appointment.status === "PAYMENT_PENDING"
    && appointment.checkoutExpiresAt > new Date()
    && payment.status === "PENDING"
    && payment.orderStatus === "CREATED";
  if (!activeHold) {
    return { success: false, code: "CHECKOUT_NOT_RESUMABLE", message: "This checkout hold has expired or closed. Choose another available slot; if you attempted payment, check its status before paying again." };
  }
  if (!["created", "attempted"].includes(providerOrder.status)
    || providerOrder.amount_paid !== 0 || providerOrder.amount_due !== payment.amountPaise) {
    return { success: false, code: "CHECKOUT_NOT_RESUMABLE", message: "This checkout is no longer payable. Return to the doctor's profile and choose another available slot." };
  }

  return {
    success: true,
    appointmentId: appointment.id,
    orderId: payment.razorpayOrderId,
    keyId: credentials.keyId,
    amount: payment.amountPaise,
    currency: payment.currency,
    amountRupees: payment.amountRupees,
    holdExpiresAt: appointment.checkoutExpiresAt.toISOString(),
    method: payment.method,
  };
}

/** Verify the Razorpay signature and captured payment with Razorpay before booking. */
export async function verifyOnlineAppointmentPayment({ appointmentId, orderId, paymentId, signature }) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  if (![appointmentId, orderId, paymentId, signature].every((value) => typeof value === "string" && value.length > 0)) {
    return { success: false, message: "Payment could not be verified." };
  }
  let credentials;
  try {
    credentials = getRazorpayApiConfig();
  } catch {
    return { success: false, message: "Payment could not be verified because online payments are unavailable." };
  }
  const { keyId, keySecret } = credentials;
  const initial = await db.appointmentPayment.findUnique({ where: { appointmentId }, include: { appointment: { include: { patient: { select: { clerkUserId: true } } } } } });
  if (!initial || initial.appointment.patient.clerkUserId !== userId || initial.razorpayOrderId !== orderId) return { success: false, message: "Payment could not be verified." };
  if (!verifyRazorpayPaymentSignature(orderId, paymentId, signature, keySecret)) return { success: false, message: "Payment could not be verified." };

  let providerPayment;
  try {
    providerPayment = await providerRequest(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: basicAuth(keyId, keySecret) },
    });
  } catch {
    return { success: false, message: "Payment could not be verified yet. Please try again." };
  }
  if (providerPayment.id !== paymentId || providerPayment.order_id !== orderId || providerPayment.amount !== initial.amountPaise || providerPayment.currency !== "INR" || providerPayment.status !== "captured" || providerPayment.captured !== true) {
    return { success: false, message: "Payment could not be verified." };
  }

  try {
    const outcome = await reconcileCapturedAppointmentPayment({
      db,
      orderId,
      paymentId,
      amountPaise: providerPayment.amount,
      currency: providerPayment.currency,
      method: providerPayment.method,
      notify: (tx, appointment) => createAppointmentNotificationPair(tx, appointment, {
        type: "APPOINTMENT_BOOKED",
        title: "Appointment booked",
        patientMessage: "Your paid appointment request was booked.",
        doctorMessage: "You have a new paid appointment request.",
        key: `appointment:${appointment.id}:booked`,
      }),
    });
    revalidatePath("/appointments");
    revalidatePath("/doctor");
    if (outcome === "PAID" || outcome === "ALREADY_PAID" || outcome === "DUPLICATE_EVENT") return { success: true, appointmentId };
    if (outcome === "REVIEW_REQUIRED") return { success: false, code: "REFUND_REVIEW_REQUIRED", message: "Payment was received, but the appointment cannot be confirmed. It has been flagged for admin review." };
    return { success: false, code: "PAYMENT_UNAVAILABLE", message: "Payment could not be applied to this appointment." };
  } catch {
    return { success: false, code: "PAYMENT_RECONCILIATION_PENDING", message: "Razorpay confirmed payment, but booking reconciliation is still pending. Do not pay again; please retry verification or contact support." };
  }
}
