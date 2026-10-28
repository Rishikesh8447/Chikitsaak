import Link from "next/link";
import { redirect } from "next/navigation";
import { Pill, FileText, ShieldCheck, CheckCircle2, Clock, AlertCircle, Building2, Phone } from "lucide-react";
import { getCurrentUser } from "@/actions/onboarding";
import { getAvailablePharmacyProducts, getPatientDispensingRequests } from "@/actions/pharmacy";
import { getMyMedicalRecords } from "@/actions/medical";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PatientPharmacyCatalog } from "@/components/patient-pharmacy-catalog";
import { PatientCancelRequestButton } from "@/components/pharmacy-forms";

export const metadata = {
  title: "Pharmacy & Prescriptions — Chikitsaak",
  description: "Browse verified medicines, review consultation prescriptions, and arrange dispensing.",
};

export default async function PatientPharmacyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/onboarding");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role === "DOCTOR") redirect("/doctor");
  if (user.role !== "PATIENT") redirect("/onboarding");

  const [{ products }, { prescriptions }, { requests: dispensingRequests }] = await Promise.all([
    getAvailablePharmacyProducts(),
    getMyMedicalRecords(),
    getPatientDispensingRequests(),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-7 px-4 py-7 sm:px-6 sm:py-9">
      <PageHeader
        icon={<Pill />}
        title="Pharmacy & Medications"
        description="Review doctor-prescribed treatments and discover verified pharmacy availability."
        backLink="/appointments"
        backLabel="Appointments"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Are you a licensed pharmacy operator?</span>
        <Link href="/pharmacy/workspace" className="font-medium text-primary hover:underline">
          Open Pharmacy Workspace →
        </Link>
      </div>

      {/* Dispensing Requests Section */}
      {dispensingRequests?.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Your Dispensing Requests</h2>
              <p className="text-xs text-muted-foreground">Status of medicine fulfillment requests sent to partner pharmacies</p>
            </div>
            <Badge variant="outline" className="text-xs">
              {dispensingRequests.length} {dispensingRequests.length === 1 ? "request" : "requests"}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {dispensingRequests.map((req) => {
              const statusClass =
                req.status === "AWAITING_STORE_CONFIRMATION" ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400" :
                req.status === "CONFIRMED" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" :
                req.status === "READY_FOR_PICKUP" ? "bg-emerald-600 text-white" :
                req.status === "COMPLETED" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400" :
                "bg-destructive/10 text-destructive";

              const statusLabel =
                req.status === "AWAITING_STORE_CONFIRMATION" ? "Awaiting Store Confirmation" :
                req.status === "CONFIRMED" ? "Confirmed — Preparing Order" :
                req.status === "READY_FOR_PICKUP" ? "Ready for Store Pickup" :
                req.status === "COMPLETED" ? "Dispensed & Completed" :
                req.status === "CANCELLED" ? "Cancelled" :
                "Declined by Pharmacy";

              const totalCost = req.items?.reduce((sum, it) => sum + Number(it.price) * it.quantity, 0) || 0;

              return (
                <Card key={req.id} className="card-vessel">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-semibold text-foreground text-sm">
                          {req.pharmacy?.name || "Partner Pharmacy"}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {req.pharmacy?.address ? `${req.pharmacy.address}, ${req.pharmacy.city}` : "Store pickup"}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] font-medium shrink-0 ${statusClass}`}>
                        {statusLabel}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div className="divide-y divide-border/60 rounded-lg border border-border/70 bg-muted/20 p-2.5 text-xs space-y-1">
                      {req.items?.map((it, idx) => (
                        <div key={idx} className="flex items-center justify-between py-1 text-muted-foreground">
                          <span className="font-medium text-foreground">{it.name} × {it.quantity}</span>
                          <span>₹{(Number(it.price) * it.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="pt-1.5 flex justify-between font-semibold text-foreground">
                        <span>Estimated Total:</span>
                        <span className="text-primary">₹{totalCost.toFixed(2)}</span>
                      </div>
                    </div>

                    {req.latestNote && (
                      <p className="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded">
                        Note: &quot;{req.latestNote}&quot;
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
                      {req.pharmacy?.contactPhone ? (
                        <a
                          href={`tel:${req.pharmacy.contactPhone}`}
                          className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
                        >
                          <Phone className="size-3" />
                          {req.pharmacy.contactPhone}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">Store pickup</span>
                      )}

                      {req.status === "AWAITING_STORE_CONFIRMATION" && (
                        <PatientCancelRequestButton requestId={req.id} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 1: Patient's Prescribed Medications from Consultations */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Your Prescribed Medications</h2>
            <p className="text-xs text-muted-foreground">Treatment plans prescribed by your consulting doctors</p>
          </div>
          <Badge variant="outline" className="gap-1 border-primary/20 bg-primary/5 text-primary">
            <ShieldCheck className="size-3" />
            Verified Digital Prescriptions
          </Badge>
        </div>

        {prescriptions?.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {prescriptions.map((rx) => (
              <Card key={rx.id} className="card-vessel">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Dr. {rx.doctor?.name || "Doctor"}</span>
                    <time className="text-[11px] text-muted-foreground">
                      {new Date(rx.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Diagnosis: <span className="font-medium text-foreground">{rx.diagnosis}</span>
                  </p>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="divide-y divide-border/60 rounded-lg border border-border/70 bg-muted/30">
                    {rx.medicines?.map((med) => (
                      <div key={med.id} className="p-3 text-xs">
                        <div className="flex items-center justify-between font-semibold text-foreground">
                          <span>{med.name}</span>
                          <span className="text-[11px] font-normal text-muted-foreground">{med.duration}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {med.dosage} · {med.frequency}
                        </p>
                        {med.instructions && (
                          <p className="mt-1 text-[11px] text-muted-foreground/90 italic">
                            &quot;{med.instructions}&quot;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {rx.generalInstructions && (
                    <p className="text-xs text-muted-foreground">
                      Doctor note: {rx.generalInstructions}
                    </p>
                  )}

                  {rx.followUpRequired && rx.followUpDays && (
                    <div className="flex items-center justify-between rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                      <span>Follow-up consultation recommended</span>
                      <span>Within {rx.followUpDays} days (₹0)</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="card-vessel">
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <FileText className="size-8 text-muted-foreground/60 mb-2" />
              <p className="text-sm font-medium text-foreground">No active prescriptions</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                Prescriptions issued during your consultations with doctors will be archived here for easy dispensing.
              </p>
              <Link href="/doctors" className="mt-4 text-xs font-semibold text-primary hover:underline">
                Find a doctor to schedule a visit →
              </Link>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Section 2: Verified Pharmacy Catalog */}
      <section className="space-y-4 pt-4 border-t border-border/70">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Verified Pharmacy Products</h2>
          <p className="text-xs text-muted-foreground">
            Search available medicines and healthcare items published by accredited pharmacies
          </p>
        </div>

        <PatientPharmacyCatalog products={products} prescriptions={prescriptions} />
      </section>

      {/* Section 3: Clinical & Dispensing Standards Notice */}
      <section className="rounded-xl border border-border/80 bg-card p-5 sm:p-6 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="size-4 text-primary" />
          <span>Chikitsaak Pharmacy Standards & Dispensing Policy</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          All medications displayed are sourced from licensed pharmacies registered on Chikitsaak. Prescription-only medications require patient verification against an active consultation record before dispensing. Direct online payment checkout is enabled for consultations and laboratory services; medication purchases are fulfilled directly through verified partner pharmacies with local pickup or home delivery where supported.
        </p>
      </section>
    </main>
  );
}
