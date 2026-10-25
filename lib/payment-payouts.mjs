export function isEligibleCollectedPayment(payment) {
  if (payment?.status !== "PAID" || !payment.verifiedAt || payment.refundStatus !== "NOT_REQUIRED") return false;
  if (payment.currency !== "INR" || !Number.isSafeInteger(payment.amountPaise) || payment.amountPaise <= 0) return false;
  if (payment.appointment?.status !== "COMPLETED") return false;
  if (!["ONLINE", "UPI_QR", "CASH"].includes(payment.method)) return false;
  return payment.method !== "CASH" || Boolean(payment.cashCollection?.paymentId);
}

export function sumAllocationPaise(allocations) {
  return allocations.reduce((sum, allocation) => sum + BigInt(allocation.amountPaise), 0n);
}

export function eligiblePaymentWhere(doctorId) {
  return {
    status: "PAID",
    verifiedAt: { not: null },
    refundStatus: "NOT_REQUIRED",
    currency: "INR",
    appointment: { is: { doctorId, status: "COMPLETED" } },
    OR: [
      { method: { in: ["ONLINE", "UPI_QR"] } },
      { method: "CASH", cashCollection: { isNot: null } },
    ],
  };
}

export async function reservePaymentCollections(tx, { doctorId, requestKey }) {
  const payments = await tx.appointmentPayment.findMany({
    where: {
      ...eligiblePaymentWhere(doctorId),
      payoutAllocations: { none: { status: { in: ["RESERVED", "PAID"] } } },
    },
    include: { appointment: { select: { status: true, doctorId: true } }, cashCollection: { select: { paymentId: true } } },
    orderBy: [{ verifiedAt: "asc" }, { id: "asc" }],
  });
  const eligible = payments.filter(isEligibleCollectedPayment);
  if (!eligible.length) throw new Error("No collected appointment payments are available for payout");
  const amountPaise = sumAllocationPaise(eligible.map((payment) => ({ amountPaise: payment.amountPaise })));
  if (amountPaise > 9223372036854775807n) throw new Error("Collected payment total exceeds the supported payout amount");
  const payout = await tx.payout.create({ data: {
    doctorId,
    currency: "INR",
    amountPaise,
    platformFeePaise: 0n,
    netAmountPaise: amountPaise,
    requestKey,
    status: "PROCESSING",
  } });
  const allocations = eligible.map((payment) => ({
    payoutId: payout.id,
    appointmentPaymentId: payment.id,
    activePaymentId: payment.id,
    amountPaise: BigInt(payment.amountPaise),
    status: "RESERVED",
  }));
  await tx.payoutPaymentAllocation.createMany({ data: allocations });
  return { ...payout, allocations };
}

export async function flagPaymentPayoutsForReview(tx, appointmentPaymentId, reason, at = new Date()) {
  if (!tx?.payoutPaymentAllocation?.findMany || !tx?.payout?.updateMany) return 0;
  const allocations = await tx.payoutPaymentAllocation.findMany({
    where: {
      appointmentPaymentId,
      status: { in: ["RESERVED", "PAID"] },
    },
    select: { payoutId: true },
  });
  const payoutIds = [...new Set(allocations.map((allocation) => allocation.payoutId))];
  if (!payoutIds.length) return 0;
  const result = await tx.payout.updateMany({
    where: { id: { in: payoutIds }, reviewRequiredAt: null },
    data: { reviewRequiredAt: at, reviewReason: reason },
  });
  return result.count;
}

export async function releasePaymentPayoutAllocations(tx, payoutId, { processedBy, at = new Date(), allowReviewRelease = false } = {}) {
  const payoutUpdate = await tx.payout.updateMany({
    where: {
      id: payoutId,
      status: "PROCESSING",
      reviewRequiredAt: allowReviewRelease ? { not: null } : null,
    },
    data: { status: "FAILED", processedAt: at, processedBy },
  });
  if (payoutUpdate.count !== 1) throw new Error("Payment payout is no longer pending");
  const allocations = await tx.payoutPaymentAllocation.findMany({
    where: { payoutId, status: "RESERVED" },
    select: { id: true },
  });
  if (!allocations.length) throw new Error("Payment payout has no reserved allocations");
  const released = await tx.payoutPaymentAllocation.updateMany({
    where: { payoutId, status: "RESERVED" },
    data: { status: "RELEASED", activePaymentId: null, releasedAt: at },
  });
  if (released.count !== allocations.length) throw new Error("Payment payout allocations changed; retry after refresh");
  return { releasedCount: released.count };
}

export async function recordPaymentPayoutTransfer(tx, { payout, adminId, transferReference, at = new Date(), allowReviewRequired = false }) {
  if (payout?.status === "PROCESSED" && payout.transferReference === transferReference) {
    return { allocationCount: 0, alreadyRecorded: true };
  }
  if (!payout || payout.status !== "PROCESSING") {
    throw new Error("Payment payout is no longer pending");
  }
  if (payout.reviewRequiredAt && !allowReviewRequired) throw new Error("Payout requires explicit refund-review resolution");
  if (allowReviewRequired && !payout.reviewRequiredAt) throw new Error("Payout is not flagged for refund review");
  const allocations = await tx.payoutPaymentAllocation.findMany({
    where: { payoutId: payout.id, status: "RESERVED" },
    include: {
      appointmentPayment: {
        include: {
          appointment: { select: { doctorId: true, status: true } },
          cashCollection: { select: { paymentId: true } },
        },
      },
    },
  });
  if (!allocations.length || allocations.some((allocation) =>
    allocation.appointmentPayment.appointment.doctorId !== payout.doctorId
    || (!allowReviewRequired && !isEligibleCollectedPayment({ ...allocation.appointmentPayment, method: allocation.appointmentPayment.method }))
  )) throw new Error("Payout allocations are no longer eligible");
  const reservedPaise = sumAllocationPaise(allocations);
  if (reservedPaise !== payout.amountPaise || allocations.some((allocation) => BigInt(allocation.amountPaise) !== BigInt(allocation.appointmentPayment.amountPaise))) {
    throw new Error("Payout allocation total does not match the reserved amount");
  }

  const changed = await tx.payout.updateMany({
    where: {
      id: payout.id,
      status: "PROCESSING",
      reviewRequiredAt: allowReviewRequired ? { not: null } : null,
    },
    data: { status: "PROCESSED", transferReference, processedAt: at, processedBy: adminId },
  });
  if (changed.count !== 1) throw new Error("Payout changed before transfer confirmation was recorded");
  const markedPaid = await tx.payoutPaymentAllocation.updateMany({
    where: { payoutId: payout.id, status: "RESERVED" },
    data: { status: "PAID", paidAt: at },
  });
  if (markedPaid.count !== allocations.length) throw new Error("Payout allocations changed before transfer confirmation was recorded");
  return { allocationCount: markedPaid.count };
}
