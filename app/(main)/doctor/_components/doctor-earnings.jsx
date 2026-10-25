"use client";

import { useEffect, useRef } from "react";
import { Calendar, CreditCard, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cancelPaymentPayoutRequest, requestPaymentPayout } from "@/actions/payout";
import useFetch from "@/hooks/use-fetch";
import { toast } from "sonner";

const formatPaise = (value = "0") => {
  const paise = BigInt(value);
  return `₹${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;
};

export function DoctorEarnings({ earnings = {}, payouts = [] }) {
  const requestKey = useRef(null);
  const { loading: requestLoading, data: requestData, fn: submitRequest } = useFetch(requestPaymentPayout);
  const { loading: cancelLoading, fn: submitCancel } = useFetch(cancelPaymentPayoutRequest);
  const paymentCollections = earnings.paymentCollections || {};
  const pendingPayout = payouts.find((payout) => payout.status === "PROCESSING");

  useEffect(() => {
    if (requestData?.success) {
      requestKey.current = null;
      toast.success(requestData.alreadyRequested ? "This payout request was already recorded." : "INR payout request submitted.");
    }
  }, [requestData]);

  const handlePaymentPayoutRequest = async () => {
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    const formData = new FormData();
    formData.set("requestKey", requestKey.current);
    await submitRequest(formData);
  };

  const cancelPayout = async () => {
    if (!pendingPayout || pendingPayout.reviewRequiredAt || !window.confirm("Cancel this payout request and release its reserved collections?")) return;
    await submitCancel(pendingPayout.id);
  };

  return (
    <div className="space-y-6 min-w-0 w-full">
      <section aria-label="Doctor earnings summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="border-border shadow-none">
          <CardContent className="flex items-center gap-3 p-5">
            <Calendar className="h-5 w-5 text-primary" />
            <div><p className="text-xs text-muted-foreground">Completed appointments</p><p className="text-2xl font-semibold">{earnings.completedAppointments || 0}</p></div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-none">
          <CardContent className="flex items-center gap-3 p-5">
            <CreditCard className="h-5 w-5 text-primary" />
            <div><p className="text-xs text-muted-foreground">Available collected earnings</p><p className="text-2xl font-semibold">{formatPaise(paymentCollections.availablePaise)}</p></div>
          </CardContent>
        </Card>
      </section>

      <Card className="border-border shadow-none">
        <CardHeader><CardTitle className="text-lg">Payment-backed INR payouts</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium">Collected appointment payments</h2><Badge variant="outline">No platform fee</Badge></div>
            <p className="text-xs text-muted-foreground">Only verified payments for completed appointments are eligible. Cash requires its audit record. Transfers are made manually by an authorized administrator.</p>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div><p className="text-xs text-muted-foreground">Collected</p><p className="font-semibold">{formatPaise(paymentCollections.collectedPaise)}</p></div>
              <div><p className="text-xs text-muted-foreground">Reserved</p><p className="font-semibold">{formatPaise(paymentCollections.reservedPaise)}</p></div>
              <div><p className="text-xs text-muted-foreground">Available</p><p className="font-semibold">{formatPaise(paymentCollections.availablePaise)}</p></div>
            </div>
            {pendingPayout ? (
              <div className="space-y-2 text-sm">
                <p>Request pending for {formatPaise(pendingPayout.netAmountPaise)}.</p>
                {pendingPayout.reviewRequiredAt ? <Alert variant="destructive"><AlertDescription>An administrator must resolve the transfer outcome before these collections can be released. The refund-review alert remains visible to administrators.</AlertDescription></Alert> : <Button type="button" variant="outline" disabled={cancelLoading} onClick={cancelPayout}>Cancel request and release collections</Button>}
              </div>
            ) : BigInt(paymentCollections.availablePaise || "0") > 0n ? (
              <Button type="button" disabled={requestLoading} onClick={handlePaymentPayoutRequest}>{requestLoading ? "Requesting…" : `Request payout of ${formatPaise(paymentCollections.availablePaise)}`}</Button>
            ) : <p className="text-xs text-muted-foreground">No eligible collected payments are available.</p>}
          </div>

          {payouts.length > 0 && <div className="space-y-3 pt-2">
            <h3 className="text-base font-semibold">Payout history</h3>
            {payouts.slice(0, 5).map((payout) => <div key={payout.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <div><p className="text-sm font-medium">{format(new Date(payout.createdAt), "MMM d, yyyy")} · {formatPaise(payout.netAmountPaise)}</p><p className="text-xs text-muted-foreground">Manual transfer reference: {payout.transferReference || "pending"}</p>{payout.reviewRequiredAt && <p className="text-xs text-destructive">Refund review: {payout.reviewReason || "Reconciliation required"}</p>}</div>
              <Badge variant="outline">{payout.status}</Badge>
            </div>)}
          </div>}
        </CardContent>
      </Card>
    </div>
  );
}
