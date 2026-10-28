import Link from "next/link";
import { redirect } from "next/navigation";
import { FlaskConical, ShieldCheck, CheckCircle2, Clock, MapPin, Sparkles } from "lucide-react";
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

export const metadata = {
  title: "Diagnostic Pathology & Lab Tests — Chikitsaak",
  description: "Book verified laboratory tests and track diagnostic reports from certified laboratories.",
};

export default async function LaboratoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/onboarding");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role === "DOCTOR") redirect("/doctor/laboratory");
  if (user.role !== "PATIENT") redirect("/onboarding");

  const [{ orders, eligibleLabs }, { laboratories }] = await Promise.all([
    getMyLabOrders(),
    getAvailableLaboratoryTests(),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-7 px-4 py-7 sm:px-6 sm:py-9">
      <PageHeader
        icon={<FlaskConical />}
        title="Diagnostic Pathology & Lab Tests"
        description="Schedule certified clinical laboratory tests and track pathology reports with verified turnaround times."
        backLink="/appointments"
        backLabel="Appointments"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Manage a medical diagnostic laboratory or clinical pathology organization?</span>
        <Link href="/laboratory/workspace" className="font-medium text-primary hover:underline">
          Open laboratory workspace →
        </Link>
      </div>

      {/* Quality & Peace-of-Mind Standard */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-card/60 p-3.5 text-xs">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="size-4" />
          </div>
          <div>
            <span className="font-semibold text-foreground">Certified Laboratories</span>
            <p className="text-[11px] text-muted-foreground">Verified licenses and NABL accreditation</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-card/60 p-3.5 text-xs">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clock className="size-4" />
          </div>
          <div>
            <span className="font-semibold text-foreground">Rapid Digital Reports</span>
            <p className="text-[11px] text-muted-foreground">Directly accessible as soon as certified</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-card/60 p-3.5 text-xs">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CheckCircle2 className="size-4" />
          </div>
          <div>
            <span className="font-semibold text-foreground">Transparent Fee Schedule</span>
            <p className="text-[11px] text-muted-foreground">Clear test pricing with zero hidden fees</p>
          </div>
        </div>
      </section>

      {/* Booking Form Card */}
      <Card className="card-vessel">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">Book a Laboratory Service</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Select tests and choose an accredited diagnostic center</p>
            </div>
            <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
              Direct Patient Booking
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {laboratories.length ? (
            <PatientBookingForm laboratories={laboratories} />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No verified laboratories have published available tests yet.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Orders Tracker Card */}
      <Card className="card-vessel">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">My Laboratory Orders</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Real-time status, sample collection dates, and clinical results</p>
            </div>
            <Badge variant="secondary" className="text-xs">
              {orders.length} Order{orders.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {orders.length ? (
            orders.map((order) => {
              const bookingTotalCents = getLabOrderBookingTotalCents(order.items);
              return (
                <article key={order.id} className="space-y-3.5 rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-colors hover:border-primary/30">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                    <div>
                      <h2 className="font-semibold text-foreground sm:text-base">
                        {order.items.map((item) => item.testName).join(", ")}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ordered {formatLabUtc(order.createdAt)}
                        {order.doctor?.name ? ` · Dr. ${order.doctor.name}` : ""}
                        {order.laboratory?.name ? ` · ${order.laboratory.name}` : ""}
                      </p>
                    </div>
                    <Badge variant={order.status === "COLLECTED" || order.status === "ACCEPTED" ? "default" : "outline"} className="text-xs">
                      {statusLabel(order.status)}
                    </Badge>
                  </div>

                  {bookingTotalCents !== null && (
                    <p className="text-sm font-medium text-foreground">
                      Total at booking: {(bookingTotalCents / 100).toFixed(2)}
                    </p>
                  )}

                  {order.collectionAt && (
                    <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                      <Clock className="size-3.5 text-primary" />
                      <span>Collection scheduled: {formatLabUtc(order.collectionAt)}</span>
                      {order.collectionNotes ? ` · ${order.collectionNotes}` : ""}
                    </div>
                  )}

                  {order.clinicalInstructions && (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground">Instructions: </span>
                      {order.clinicalInstructions}
                    </p>
                  )}

                  {order.items.map(
                    (item) =>
                      (item.testCategory || item.testDescription) && (
                        <p key={item.id} className="text-xs text-muted-foreground">
                          {item.testCategory && `${item.testCategory} · `}
                          {item.testDescription}
                        </p>
                      )
                  )}

                  {order.status === "AWAITING_LAB_SELECTION" && (
                    <div className="rounded-lg bg-amber-500/10 p-3 border border-amber-500/20">
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-2">
                        Doctor order placed — choose an accredited laboratory to fulfill this test:
                      </p>
                      <PatientChooseLabForm orderId={order.id} laboratories={eligibleLabs[order.id] || []} />
                    </div>
                  )}

                  {order.status === "REJECTED" && order.source === "DOCTOR" && (
                    <div className="rounded-lg bg-destructive/10 p-3 border border-destructive/20">
                      <p className="text-xs font-medium text-destructive mb-2">
                        This order was not accepted by the selected laboratory. You may select another laboratory:
                      </p>
                      <PatientRetryLabOrderForm orderId={order.id} />
                    </div>
                  )}

                  {!order.statusHistory.length ? null : <details className="text-xs text-muted-foreground rounded-lg bg-muted/30 p-3 border border-border/70"><summary className="cursor-pointer font-medium text-foreground select-none">Order history and results</summary><ol className="mt-2 space-y-2 border-t border-border/60 pt-2">{order.statusHistory.map((entry, index) => <li key={`${entry.toStatus}-${index}`}>{formatLabUtc(entry.createdAt)} · {statusLabel(entry.toStatus)}{entry.note?.startsWith("Laboratory result: ") ? <p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-sm text-foreground shadow-xs">{entry.note.slice("Laboratory result: ".length)}</p> : entry.note ? ` · ${entry.note}` : ""}</li>)}</ol></details>}
                </article>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <FlaskConical className="size-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium text-foreground">No laboratory orders yet</p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Your test orders and pathology findings from consulting clinicians will appear here.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
