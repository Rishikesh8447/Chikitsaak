"use client";

import { useEffect, useState } from "react";
import { AlertCircle, User } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { recordPaymentPayoutTransferAction, resolvePaymentPayoutOutcomeAction } from "@/actions/admin";
import useFetch from "@/hooks/use-fetch";
import { toast } from "sonner";

const formatPaise = (value = "0") => {
  const paise = BigInt(value);
  return `₹${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;
};

export function PendingPayouts({ payouts = [], paymentPayoutIssues = [] }) {
  const [transferReferences, setTransferReferences] = useState({});
  const { loading: recording, fn: submitTransfer } = useFetch(recordPaymentPayoutTransferAction);
  const { loading: resolving, data: outcomeData, fn: submitResolution } = useFetch(resolvePaymentPayoutOutcomeAction);

  useEffect(() => {
    if (outcomeData?.success) toast.success(outcomeData.alreadyResolved ? "Payout outcome was already recorded." : "Payout transfer outcome recorded.");
  }, [outcomeData]);

  const recordTransfer = async (payout) => {
    const reference = transferReferences[payout.id]?.trim();
    if (!reference || !window.confirm("Confirm that this manual bank transfer has already completed. This records the reference only; it does not send money.")) return;
    const formData = new FormData();
    formData.set("payoutId", payout.id);
    formData.set("transferReference", reference);
    formData.set("transferConfirmed", "true");
    await submitTransfer(formData);
    setTransferReferences((current) => ({ ...current, [payout.id]: "" }));
  };

  const resolveOutcome = async (payout, resolution) => {
    const reference = transferReferences[payout.id]?.trim();
    const prompt = resolution === "NOT_SENT"
      ? `Confirm that no bank or UPI transfer was sent for Dr. ${payout.doctor.name}'s payout. Reserved collections will be released.`
      : `Confirm that the manual transfer for Dr. ${payout.doctor.name}'s payout has already completed. This records it only; it does not send or reverse money.`;
    if (resolving || !window.confirm(prompt) || (resolution === "TRANSFER_SENT" && !reference)) return;
    const formData = new FormData();
    formData.set("payoutId", payout.id);
    formData.set("resolution", resolution);
    if (resolution === "NOT_SENT") formData.set("transferNotSentConfirmed", "true");
    else {
      formData.set("transferReference", reference);
      formData.set("transferConfirmed", "true");
    }
    await submitResolution(formData);
    if (resolution === "TRANSFER_SENT") setTransferReferences((current) => ({ ...current, [payout.id]: "" }));
  };

  return <div className="space-y-4">
    {paymentPayoutIssues.length > 0 && <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        <strong>Post-transfer payment review</strong>
        <ul className="mt-2 space-y-1">{paymentPayoutIssues.map((payout) => <li key={payout.id}>
          Dr. {payout.doctor.name}: {formatPaise(payout.netAmountPaise)} transferred ({payout.transferReference}); {payout.reviewReason}. Reconcile manually; no bank transfer is reversed here.
        </li>)}</ul>
      </AlertDescription>
    </Alert>}
    <Card className="border-emerald-900/20 bg-muted/20">
      <CardHeader><CardTitle className="text-xl">Pending INR payouts</CardTitle><CardDescription>Transfers are performed manually outside the application. Record them only after confirmation.</CardDescription></CardHeader>
      <CardContent>
        {payouts.length === 0 ? <div className="py-8 text-center text-muted-foreground">No pending payout requests at this time.</div> : <div className="space-y-4">
          {payouts.map((payout) => {
            const flagged = Boolean(payout.reviewRequiredAt);
            return <Card key={payout.id} className="border-emerald-900/20 bg-background">
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3"><div className="mt-1 rounded-full bg-muted/20 p-2"><User className="h-5 w-5 text-primary" /></div><div>
                    <h3 className="font-medium">Dr. {payout.doctor.name}</h3><p className="text-sm text-muted-foreground">{payout.doctor.specialty}</p>
                    <p className="mt-2 text-sm font-medium">INR collection · {formatPaise(payout.netAmountPaise)} · no commission</p>
                    <p className="text-xs text-muted-foreground">Requested {format(new Date(payout.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
                  </div></div>
                  <Badge variant="outline">Processing</Badge>
                </div>
                {flagged && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription><strong>Refund review remains open.</strong> {payout.reviewReason || "A payment event needs reconciliation."} Resolve the transfer outcome explicitly. A recorded transfer does not reverse or issue a refund.</AlertDescription></Alert>}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input aria-label={`Transfer reference for ${payout.doctor.name}`} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" value={transferReferences[payout.id] || ""} onChange={(event) => setTransferReferences((current) => ({ ...current, [payout.id]: event.target.value }))} placeholder="Manual bank transfer reference" />
                  {flagged ? <>
                    <Button type="button" variant="outline" disabled={resolving} onClick={() => resolveOutcome(payout, "NOT_SENT")}>Confirm not sent &amp; release</Button>
                    <Button type="button" disabled={resolving || !transferReferences[payout.id]?.trim()} onClick={() => resolveOutcome(payout, "TRANSFER_SENT")}>Record transfer already sent</Button>
                  </> : <Button type="button" disabled={recording || !transferReferences[payout.id]?.trim()} onClick={() => recordTransfer(payout)}>Record confirmed transfer</Button>}
                </div>
              </CardContent>
            </Card>;
          })}
        </div>}
      </CardContent>
    </Card>
  </div>;
}
