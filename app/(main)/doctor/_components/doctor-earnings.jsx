"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TrendingUp,
  Calendar,
  BarChart3,
  CreditCard,
  Loader2,
  AlertCircle,
  Coins,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { requestPayout } from "@/actions/payout";
import useFetch from "@/hooks/use-fetch";
import { toast } from "sonner";

export function DoctorEarnings({ earnings, payouts = [] }) {
  const [showPayoutDialog, setShowPayoutDialog] = useState(false);
  const [paypalEmail, setPaypalEmail] = useState("");

  const {
    thisMonthEarnings = 0,
    completedAppointments = 0,
    averageEarningsPerMonth = 0,
    availableCredits = 0,
    availablePayout = 0,
  } = earnings;

  // Custom hook for payout request
  const { loading, data, fn: submitPayoutRequest } = useFetch(requestPayout);

  // Check if there's any pending payout
  const pendingPayout = payouts.find(
    (payout) => payout.status === "PROCESSING"
  );

  const handlePayoutRequest = async (e) => {
    e.preventDefault();

    if (!paypalEmail) {
      toast.error("PayPal email is required");
      return;
    }

    const formData = new FormData();
    formData.append("paypalEmail", paypalEmail);

    await submitPayoutRequest(formData);
  };

  useEffect(() => {
    if (data?.success) {
      setShowPayoutDialog(false);
      setPaypalEmail("");
      toast.success("Payout request submitted successfully!");
    }
  }, [data]);

  const platformFee = availableCredits * 2; // $2 per credit

  return (
    <div className="space-y-6 min-w-0 w-full">
      {/* Earnings Overview */}
      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <Card className="min-w-0 border-border shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Available Credits
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                  {availableCredits}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  ${availablePayout.toFixed(2)} available for payout
                </p>
              </div>
              <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-3 rounded-xl shrink-0">
                <Coins className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-border shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">This Month</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                  ${thisMonthEarnings.toFixed(2)}
                </p>
              </div>
              <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-3 rounded-xl shrink-0">
                <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-border shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Total Appointments
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                  {completedAppointments}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">completed</p>
              </div>
              <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-3 rounded-xl shrink-0">
                <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-border shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Avg/Month</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                  ${averageEarningsPerMonth.toFixed(2)}
                </p>
              </div>
              <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-3 rounded-xl shrink-0">
                <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payout Section */}
      <Card className="min-w-0 border-border shadow-none">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-foreground flex items-center">
            <CreditCard className="h-5 w-5 mr-2 text-emerald-600 dark:text-emerald-400" />
            Payout Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Payout Status */}
          <div className="min-w-0 rounded-xl border border-border/80 bg-muted/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-medium text-foreground">
                Available for Payout
              </h2>
              {pendingPayout ? (
                <Badge
                  className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                >
                  PROCESSING
                </Badge>
              ) : (
                <Badge
                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                >
                  Available
                </Badge>
              )}
            </div>

            {pendingPayout ? (
              <div className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Pending Credits</p>
                    <p className="text-foreground font-semibold">
                      {pendingPayout.credits}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pending Amount</p>
                    <p className="text-foreground font-semibold">
                      ${pendingPayout.netAmount.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">PayPal Email</p>
                    <p className="text-foreground font-medium text-xs">
                      {pendingPayout.paypalEmail}
                    </p>
                  </div>
                </div>
                <Alert className="mt-2 border-border/80">
                  <AlertCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <AlertDescription className="text-xs text-muted-foreground">
                    Your payout request is queued for manual processing. You&apos;ll receive the
                    payment once an admin approves it. Your credits will be
                    deducted after processing.
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Available Credits</p>
                  <p className="text-foreground font-semibold">{availableCredits}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payout Amount</p>
                  <p className="text-foreground font-semibold">
                    ${availablePayout.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Platform Fee</p>
                  <p className="text-foreground font-semibold">
                    ${platformFee.toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            {!pendingPayout && availableCredits > 0 && (
              <Button
                onClick={() => setShowPayoutDialog(true)}
                className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
              >
                Request Payout for All Credits
              </Button>
            )}

            {availableCredits === 0 && !pendingPayout && (
              <div className="text-center py-3">
                <p className="text-xs text-muted-foreground">
                  No credits available for payout. Complete more appointments to
                  earn credits.
                </p>
              </div>
            )}
          </div>

          {/* Payout Information */}
          <Alert className="border-border/80">
            <AlertCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <AlertDescription className="text-xs text-muted-foreground">
              <strong className="text-foreground">Payout Structure:</strong> You earn $8 per credit.
              Platform fee is $2 per credit. Payouts include all your available
              credits and are processed via PayPal.
            </AlertDescription>
          </Alert>

          {/* Payout History */}
          {payouts.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-base font-semibold text-foreground">Payout History</h3>
              <div className="space-y-2">
                {payouts.slice(0, 5).map((payout) => (
                  <div
                    key={payout.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/80"
                  >
                    <div>
                      <p className="text-foreground font-medium text-sm">
                        {format(new Date(payout.createdAt), "MMM d, yyyy")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {payout.credits} credits • $
                        {payout.netAmount.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {payout.paypalEmail}
                      </p>
                    </div>
                    <Badge
                      className={
                        payout.status === "PROCESSED"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      }
                    >
                      {payout.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payout Request Dialog */}
      <Dialog open={showPayoutDialog} onOpenChange={setShowPayoutDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">
              Request Payout
            </DialogTitle>
            <DialogDescription>
              Request payout for all your available credits
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePayoutRequest} className="space-y-4">
            <div className="bg-muted/30 p-4 rounded-xl space-y-2 border border-border/80 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Available credits:
                </span>
                <span className="text-foreground font-medium">{availableCredits}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross amount:</span>
                <span className="text-foreground font-medium">
                  ${(availableCredits * 10).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Platform fee (20%):
                </span>
                <span className="text-foreground font-medium">-${platformFee.toFixed(2)}</span>
              </div>
              <div className="border-t border-border/80 pt-2 flex justify-between font-semibold">
                <span className="text-foreground">Net payout:</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  ${availablePayout.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paypalEmail" className="text-foreground">PayPal Email</Label>
              <Input
                id="paypalEmail"
                type="email"
                placeholder="your-email@paypal.com"
                value={paypalEmail}
                onChange={(e) => setPaypalEmail(e.target.value)}
                className="bg-background border-border"
                required
              />
              <p className="text-xs text-muted-foreground">
                Enter the PayPal email where you want to receive the payout.
              </p>
            </div>

            <Alert className="border-border/80">
              <AlertCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <AlertDescription className="text-xs text-muted-foreground">
                Once processed by admin, {availableCredits} credits will be
                deducted from your account and ${availablePayout.toFixed(2)}{" "}
                will be sent to your PayPal.
              </AlertDescription>
            </Alert>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPayoutDialog(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Requesting...
                  </>
                ) : (
                  "Request Payout"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
