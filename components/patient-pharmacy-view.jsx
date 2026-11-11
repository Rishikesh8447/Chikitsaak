"use client";

import Link from "next/link";
import { Pill, FileText, ShieldCheck, Phone } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PatientPharmacyCatalog } from "@/components/patient-pharmacy-catalog";
import { PatientCancelRequestButton } from "@/components/pharmacy-forms";
import { useLanguage } from "@/components/language-provider";

function getDispensingStatusDetails(status, t) {
  switch (status) {
    case "AWAITING_STORE_CONFIRMATION":
      return {
        className: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        label: t("pharmacy.statusAwaitingStoreConfirmation", "Awaiting Store Confirmation"),
      };
    case "CONFIRMED":
      return {
        className: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
        label: t("pharmacy.statusConfirmedPreparing", "Confirmed — Preparing Order"),
      };
    case "READY_FOR_PICKUP":
      return {
        className: "bg-emerald-600 text-white",
        label: t("pharmacy.statusReadyForPickup", "Ready for Store Pickup"),
      };
    case "COMPLETED":
      return {
        className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
        label: t("pharmacy.statusCompleted", "Dispensed & Completed"),
      };
    case "CANCELLED":
      return {
        className: "bg-destructive/10 text-destructive",
        label: t("pharmacy.statusCancelled", "Cancelled"),
      };
    default:
      return {
        className: "bg-destructive/10 text-destructive",
        label: t("pharmacy.statusDeclined", "Declined by Pharmacy"),
      };
  }
}

export function PatientPharmacyView({ products = [], prescriptions = [], dispensingRequests = [] }) {
  const { t } = useLanguage();

  return (
    <main className="mx-auto w-full max-w-6xl space-y-7 px-4 py-7 sm:px-6 sm:py-9">
      <PageHeader
        icon={<Pill />}
        title={t("pharmacy.title", "Pharmacy & Medications")}
        description={t("pharmacy.subtitle", "Review doctor-prescribed treatments and discover verified pharmacy availability.")}
        backLink="/appointments"
        backLabel={t("pharmacy.backLink", "Appointments")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{t("pharmacy.operatorPrompt", "Are you a licensed pharmacy operator?")}</span>
        <Link href="/pharmacy/workspace" className="font-medium text-primary hover:underline">
          {t("pharmacy.operatorLink", "Open Pharmacy Workspace →")}
        </Link>
      </div>

      {/* Dispensing Requests Section */}
      {dispensingRequests?.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {t("pharmacy.requestsTitle", "Your Dispensing Requests")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("pharmacy.requestsSubtitle", "Status of medicine fulfillment requests sent to partner pharmacies")}
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              {dispensingRequests.length === 1
                ? t("pharmacy.requestCount", "{count} request", { count: dispensingRequests.length })
                : t("pharmacy.requestCountPlural", "{count} requests", { count: dispensingRequests.length })}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {dispensingRequests.map((req) => {
              const { className: statusClass, label: statusLabel } = getDispensingStatusDetails(req.status, t);
              const totalCost = req.items?.reduce((sum, it) => sum + Number(it.price) * it.quantity, 0) || 0;

              return (
                <Card key={req.id} className="card-vessel">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-semibold text-foreground text-sm">
                          {req.pharmacy?.name || t("pharmacy.partnerPharmacy", "Partner Pharmacy")}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {req.pharmacy?.address
                            ? `${req.pharmacy.address}, ${req.pharmacy.city}`
                            : t("pharmacy.storePickup", "Store pickup")}
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
                        <span>{t("pharmacy.estimatedTotal", "Estimated Total:")}</span>
                        <span className="text-primary">₹{totalCost.toFixed(2)}</span>
                      </div>
                    </div>

                    {req.latestNote && (
                      <p className="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded">
                        {t("pharmacy.notePrefix", 'Note: "{note}"', { note: req.latestNote })}
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
                        <span className="text-xs text-muted-foreground">
                          {t("pharmacy.storePickup", "Store pickup")}
                        </span>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {t("pharmacy.prescriptionsTitle", "Your Prescribed Medications")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("pharmacy.prescriptionsSubtitle", "Treatment plans prescribed by your consulting doctors")}
            </p>
          </div>
          <Badge variant="outline" className="gap-1 border-primary/20 bg-primary/5 text-primary">
            <ShieldCheck className="size-3" />
            {t("pharmacy.verifiedPrescriptionsBadge", "Verified Digital Prescriptions")}
          </Badge>
        </div>

        {prescriptions?.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {prescriptions.map((rx) => (
              <Card key={rx.id} className="card-vessel">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">
                      {t("pharmacy.doctorPrefix", "Dr. {name}", { name: rx.doctor?.name || t("pharmacy.doctorDefault", "Doctor") })}
                    </span>
                    <time className="text-[11px] text-muted-foreground">
                      {new Date(rx.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {t("pharmacy.diagnosisLabel", "Diagnosis: {diagnosis}", { diagnosis: rx.diagnosis })}
                    </span>
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
                      {t("pharmacy.doctorNotePrefix", "Doctor note: {note}", { note: rx.generalInstructions })}
                    </p>
                  )}

                  {rx.followUpRequired && rx.followUpDays && (
                    <div className="flex items-center justify-between rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                      <span>{t("pharmacy.followUpRecommended", "Follow-up consultation recommended")}</span>
                      <span>{t("pharmacy.withinDaysFree", "Within {days} days (₹0)", { days: rx.followUpDays })}</span>
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
              <p className="text-sm font-medium text-foreground">
                {t("pharmacy.noPrescriptionsTitle", "No active prescriptions")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                {t("pharmacy.noPrescriptionsSubtitle", "Prescriptions issued during your consultations with doctors will be archived here for easy dispensing.")}
              </p>
              <Link href="/doctors" className="mt-4 text-xs font-semibold text-primary hover:underline">
                {t("pharmacy.findDoctorLink", "Find a doctor to schedule a visit →")}
              </Link>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Section 2: Verified Pharmacy Catalog */}
      <section className="space-y-4 pt-4 border-t border-border/70">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t("pharmacy.catalogTitle", "Verified Pharmacy Products")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("pharmacy.catalogSubtitle", "Search available medicines and healthcare items published by accredited pharmacies")}
          </p>
        </div>

        <PatientPharmacyCatalog products={products} prescriptions={prescriptions} />
      </section>

      {/* Section 3: Clinical & Dispensing Standards Notice */}
      <section className="rounded-xl border border-border/80 bg-card p-5 sm:p-6 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="size-4 text-primary" />
          <span>{t("pharmacy.policyTitle", "Chikitsaak Pharmacy Standards & Dispensing Policy")}</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("pharmacy.policyDesc", "All medications displayed are sourced from licensed pharmacies registered on Chikitsaak. Prescription-only medications require patient verification against an active consultation record before dispensing. Direct online payment checkout is enabled for consultations and laboratory services; medication purchases are fulfilled directly through verified partner pharmacies with local pickup or home delivery where supported.")}
        </p>
      </section>
    </main>
  );
}

