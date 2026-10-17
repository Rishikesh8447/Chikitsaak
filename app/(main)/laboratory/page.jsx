import Link from "next/link";
import { redirect } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { getCurrentUser } from "@/actions/onboarding";
import { getAvailableLaboratoryTests, getMyLabOrders } from "@/actions/laboratory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { formatLabUtc } from "@/lib/lab-date-time.mjs";
import { getLabOrderBookingTotalCents } from "@/lib/laboratory-workflow.mjs";
import { PatientBookingForm, PatientChooseLabForm, PatientRetryLabOrderForm } from "@/components/laboratory-forms";

function statusLabel(status) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function LaboratoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/onboarding");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role === "DOCTOR") redirect("/doctor/laboratory");
  if (user.role !== "PATIENT") redirect("/onboarding");

  const [{ orders, eligibleLabs }, { laboratories }] = await Promise.all([getMyLabOrders(), getAvailableLaboratoryTests()]);
  return <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-7 sm:px-6 sm:py-9">
    <PageHeader icon={<FlaskConical />} title="Laboratory tests" description="Book available tests and track orders from your doctor." backLink="/appointments" backLabel="Appointments" />
    <p className="text-sm text-muted-foreground">Represent a laboratory or manage an existing organization? <Link href="/laboratory/workspace" className="font-medium text-primary hover:underline">Open laboratory workspace</Link></p>
    <Card><CardHeader><CardTitle>Book a laboratory service</CardTitle></CardHeader><CardContent>
      {laboratories.length ? <PatientBookingForm laboratories={laboratories} /> : <p className="text-sm text-muted-foreground">No verified laboratories have published available tests yet.</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>My laboratory orders</CardTitle></CardHeader><CardContent className="space-y-3">
      {orders.length ? orders.map((order) => {
        const bookingTotalCents = getLabOrderBookingTotalCents(order.items);
        return <article key={order.id} className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{order.items.map((item) => item.testName).join(", ")}</h2><p className="mt-1 text-xs text-muted-foreground">Ordered {formatLabUtc(order.createdAt)}{order.doctor?.name ? ` · Dr. ${order.doctor.name}` : ""}{order.laboratory?.name ? ` · ${order.laboratory.name}` : ""}</p></div><Badge variant="outline">{statusLabel(order.status)}</Badge></div>
        {bookingTotalCents !== null && <p className="text-sm font-medium">Total at booking: {(bookingTotalCents / 100).toFixed(2)}</p>}
        {order.collectionAt && <p className="text-sm">Collection scheduled: {formatLabUtc(order.collectionAt)}{order.collectionNotes ? ` · ${order.collectionNotes}` : ""}</p>}
        {order.clinicalInstructions && <p className="text-sm text-muted-foreground">Instructions: {order.clinicalInstructions}</p>}
        {order.items.map((item) => (item.testCategory || item.testDescription) && <p key={item.id} className="text-sm text-muted-foreground">{item.testCategory && `${item.testCategory} · `}{item.testDescription}</p>)}
        {order.status === "AWAITING_LAB_SELECTION" && <PatientChooseLabForm orderId={order.id} laboratories={eligibleLabs[order.id] || []} />}
        {order.status === "REJECTED" && order.source === "DOCTOR" && <PatientRetryLabOrderForm orderId={order.id} />}
        {!order.statusHistory.length ? null : <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Order history and results</summary><ol className="mt-2 space-y-2">{order.statusHistory.map((entry, index) => <li key={`${entry.toStatus}-${index}`}>{formatLabUtc(entry.createdAt)} · {statusLabel(entry.toStatus)}{entry.note?.startsWith("Laboratory result: ") ? <p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">{entry.note.slice("Laboratory result: ".length)}</p> : entry.note ? ` · ${entry.note}` : ""}</li>)}</ol></details>}
      </article>}) : <p className="text-sm text-muted-foreground">Your test orders will appear here.</p>}
    </CardContent></Card>
  </main>;
}
