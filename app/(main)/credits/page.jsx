import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/onboarding";
import { checkAndAllocateCredits, getMyCreditPlan, getMyCreditTransactions } from "@/actions/credits";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { CreditCard, History } from "lucide-react";

const labels = { CREDIT_PURCHASE: "Credit purchase", APPOINTMENT_DEDUCTION: "Appointment consultation", APPOINTMENT_REFUND: "Appointment refund", ADMIN_ADJUSTMENT: "Account adjustment" };

export default async function CreditsPage() {
  const user = await getCurrentUser();
  if (!user || !["PATIENT", "DOCTOR", "ADMIN"].includes(user.role)) redirect("/onboarding");
  let planStatus = null;
  let allocationStatus = null;
  if (user.role === "PATIENT") {
    // The Clerk checkout return is /credits; resolve the entitlement and allocate
    // before reading the balance so this render shows the latest Prisma value.
    allocationStatus = await checkAndAllocateCredits();
    planStatus = await getMyCreditPlan();
  }
  const { balance, transactions } = await getMyCreditTransactions();
  const planLabels = { free_user: "Free", standard: "Standard", premium: "Premium" };
  return <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-7 sm:px-6 sm:py-9">
    <PageHeader icon={<CreditCard />} title="Credits & activity" description="Your Chikitsaak balance and recent credit activity." backLink={user.role === "DOCTOR" ? "/doctor" : "/appointments"} backLabel="Dashboard" />
    <Card className="border-primary/20 bg-primary/[0.035]"><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"><div><p className="text-sm text-muted-foreground">Available balance</p><p className="mt-1 text-4xl font-semibold tracking-tight text-primary">{balance}<span className="ml-2 text-sm font-medium">credits</span></p></div><Badge variant="outline" className="border-primary/20 bg-card text-primary">Chikitsaak balance</Badge></CardContent></Card>
    {allocationStatus?.success && allocationStatus.allocated && allocationStatus.monthlyCredits > 0 && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">{allocationStatus.monthlyCredits} monthly credits were added to your balance.</p>}
    {allocationStatus && !allocationStatus.success && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">{allocationStatus.message}</p>}
    {planStatus ? <Card><CardHeader><CardTitle>Subscription plan</CardTitle></CardHeader><CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
      <p>Current Clerk plan: <span className="font-medium text-foreground">{planStatus.plan ? planLabels[planStatus.plan] : "No active plan detected"}</span></p>
      <p>Monthly plan allowance: <span className="font-medium text-foreground">{planStatus.monthlyCredits === null ? "Unavailable" : `${planStatus.monthlyCredits} credits (${Math.floor(planStatus.monthlyCredits / 2)} consultations)`}</span></p>
      {planStatus.error && <p role="status">{planStatus.error}</p>}
      {planStatus.plan === "free_user" && <p>The Free plan has no recurring monthly credit grant. New accounts receive the existing 2-credit starting grant.</p>}
      <p>Your available appointment credits remain in your Chikitsaak balance; subscription entitlements are not a second spendable balance.</p>
      <Link href="/#pricing" className="inline-flex font-medium text-primary hover:underline">View plans and subscription options</Link>
    </CardContent></Card> : <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Doctor appointment credits are earned through completed consultations. Subscription allowances apply to patient accounts.</p>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4 text-primary" />Credit activity</CardTitle></CardHeader><CardContent>
      {transactions.length ? <div className="divide-y divide-border">{transactions.map((transaction) => <div key={transaction.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="font-medium text-foreground">{labels[transaction.type] || transaction.type}</p><p className="mt-0.5 text-xs text-muted-foreground">{new Date(transaction.createdAt).toLocaleString()}{transaction.packageId ? ` · ${transaction.packageId}` : ""}</p></div><p aria-label={`${transaction.amount >= 0 ? "Positive" : "Negative"} ${Math.abs(transaction.amount)} credits`} className={`text-base font-semibold tabular-nums ${transaction.amount >= 0 ? "text-primary" : "text-destructive"}`}>{transaction.amount >= 0 ? "+" : ""}{transaction.amount}</p></div>)}</div> : <div className="rounded-lg border border-dashed border-border p-7 text-center text-sm text-muted-foreground">No credit activity yet. Your transactions will appear here.</div>}
    </CardContent></Card>
  </main>;
}
