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
  if (user.role === "PATIENT") {
    // Recheck on the checkout return route as well; monthly allocation is idempotent.
    await checkAndAllocateCredits();
    planStatus = await getMyCreditPlan();
  }
  const { balance, transactions } = await getMyCreditTransactions();
  const planLabels = { free_user: "Free", standard: "Standard", premium: "Premium" };
  return <main className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
    <PageHeader icon={<CreditCard />} title="Credits & Transaction History" backLink={user.role === "DOCTOR" ? "/doctor" : "/appointments"} backLabel="Dashboard" />
    <Card><CardContent className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-muted-foreground">Available credits</p><p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{balance}</p></div><Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400">Database balance</Badge></CardContent></Card>
    {planStatus ? <Card><CardHeader><CardTitle>Subscription plan</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground">
      <p>Current Clerk plan: <span className="font-medium text-foreground">{planStatus.plan ? planLabels[planStatus.plan] : "No active plan detected"}</span></p>
      <p>Monthly plan allowance: <span className="font-medium text-foreground">{planStatus.monthlyCredits === null ? "Unavailable" : `${planStatus.monthlyCredits} credits (${Math.floor(planStatus.monthlyCredits / 2)} consultations)`}</span></p>
      {planStatus.plan === "free_user" && <p>The Free plan has no recurring monthly credit grant. New accounts receive the existing 2-credit starting grant.</p>}
      <p>Your available appointment credits remain in your Chikitsaak balance; subscription entitlements are not a second spendable balance.</p>
      <Link href="/#pricing" className="inline-flex font-medium text-primary hover:underline">View plans and subscription options</Link>
    </CardContent></Card> : <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Doctor appointment credits are earned through completed consultations. Subscription allowances apply to patient accounts.</p>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-emerald-500" />Credit transactions</CardTitle></CardHeader><CardContent>
      {transactions.length ? <div className="space-y-2">{transactions.map((transaction) => <div key={transaction.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/80 p-3"><div><p className="font-medium text-foreground">{labels[transaction.type] || transaction.type}</p><p className="text-sm text-muted-foreground">{new Date(transaction.createdAt).toLocaleString()}{transaction.packageId ? ` · ${transaction.packageId}` : ""}</p></div><p aria-label={`${transaction.amount >= 0 ? "Positive" : "Negative"} ${Math.abs(transaction.amount)} credits`} className={`text-lg font-semibold ${transaction.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{transaction.amount >= 0 ? "+" : ""}{transaction.amount}</p></div>)}</div> : <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No credit transactions available yet.</div>}
    </CardContent></Card>
  </main>;
}
