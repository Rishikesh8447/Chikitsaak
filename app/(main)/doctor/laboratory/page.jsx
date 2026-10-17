import { redirect } from "next/navigation";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { getCurrentUser } from "@/actions/onboarding";
import { getDoctorLabOrderOptions, getDoctorLabOrders } from "@/actions/laboratory";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { DoctorLabOrderForm } from "@/components/laboratory-forms";
import { formatLabUtc } from "@/lib/lab-date-time.mjs";

export default async function DoctorLaboratoryPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") redirect("/onboarding");
  if (user.verificationStatus !== "VERIFIED") redirect("/doctor/verification");
  const [{ appointments, tests }, orders] = await Promise.all([getDoctorLabOrderOptions(), getDoctorLabOrders()]);
  return <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-7 sm:px-6 sm:py-9">
    <PageHeader icon={<FlaskConical />} title="Order laboratory tests" description="Create test orders for patients from your active or completed consultations." backLink="/doctor" backLabel="Doctor workspace" />
    <Card><CardHeader><CardTitle>New test order</CardTitle></CardHeader><CardContent>
      {appointments.length ? <DoctorLabOrderForm appointments={appointments} tests={tests} /> : <p className="text-sm text-muted-foreground">A patient must have a confirmed, in-progress, or completed appointment with you before you can order tests.</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Orders and results</CardTitle></CardHeader><CardContent className="space-y-3">
      {orders.length ? orders.map((order) => <article key={order.id} className="rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{order.items.map((item) => item.testName).join(", ")}</h2><p className="mt-1 text-xs text-muted-foreground">{order.patient.name || "Patient"}{order.laboratory?.name ? ` · ${order.laboratory.name}` : ""} · Ordered {formatLabUtc(order.createdAt)}</p></div><Badge variant="outline">{order.status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}</Badge></div>
        {order.items.map((item) => item.testCategory && <p key={item.id} className="mt-1 text-xs text-muted-foreground">{item.testCategory}</p>)}
        {order.statusHistory.map((entry, index) => <div key={`${entry.toStatus}-${index}`} className="mt-2 text-xs text-muted-foreground">{formatLabUtc(entry.createdAt)} · {entry.toStatus.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}{entry.note?.startsWith("Laboratory result: ") ? <p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">{entry.note.slice("Laboratory result: ".length)}</p> : null}</div>)}
      </article>) : <p className="text-sm text-muted-foreground">Test orders you create will appear here with their status and results.</p>}
    </CardContent></Card>
    <p className="text-sm text-muted-foreground">Laboratory partner account? <Link href="/laboratory/workspace" className="font-medium text-primary hover:underline">Open the laboratory workspace</Link></p>
    <p className="text-xs leading-5 text-muted-foreground">Patients select a verified laboratory after you place the order. Patient identity is taken from the appointment record.</p>
  </main>;
}
