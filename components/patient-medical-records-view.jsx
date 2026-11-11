"use client";

import Link from "next/link";
import { MedicalProfileForm } from "@/components/medical-profile-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { FileText, HeartPulse, ShieldCheck, Stethoscope, Clock, Pill, ArrowRight } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

export function PatientMedicalRecordsView({ profile, appointments = [], prescriptions = [] }) {
  const { t, locale } = useLanguage();

  return (
    <main className="mx-auto w-full max-w-6xl space-y-7 px-4 py-7 sm:px-6 sm:py-9">
      <PageHeader
        identity={{ label: t("medicalRecords.dashboardBadge", "Patient Dashboard"), icon: HeartPulse }}
        icon={<HeartPulse />}
        title={t("medicalRecords.title", "Medical Dossier & Records")}
        description={t(
          "medicalRecords.description",
          "Your confidential health history, clinical profiles, and digital prescriptions organized in one private place."
        )}
        backLink="/appointments"
        backLabel={t("medicalRecords.backLabel", "Appointments")}
      />

      {/* Top Clinical Overview Badges */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-card/60 p-3.5 text-xs">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
            <ShieldCheck className="size-4" />
          </div>
          <div>
            <span className="font-semibold text-foreground">
              {t("medicalRecords.encryptedBadge", "Encrypted Health Dossier")}
            </span>
            <p className="text-[11px] text-muted-foreground">
              {t("medicalRecords.encryptedDesc", "Accessible only by you and consulting physicians")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-card/60 p-3.5 text-xs">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
            <Stethoscope className="size-4" />
          </div>
          <div>
            <span className="font-semibold text-foreground">
              {t("medicalRecords.consultationBadge", "Consultation Provenance")}
            </span>
            <p className="text-[11px] text-muted-foreground">
              {t("medicalRecords.consultationVisits", "{count} historical clinical visit{plural}", {
                count: appointments.length,
                plural: appointments.length !== 1 ? "s" : "",
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-card/60 p-3.5 text-xs">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
            <Pill className="size-4" />
          </div>
          <div>
            <span className="font-semibold text-foreground">
              {t("medicalRecords.prescriptionsBadge", "Digital Prescriptions")}
            </span>
            <p className="text-[11px] text-muted-foreground">
              {t("medicalRecords.prescriptionsArchive", "{count} verified prescription archive{plural}", {
                count: prescriptions.length,
                plural: prescriptions.length !== 1 ? "s" : "",
              })}
            </p>
          </div>
        </div>
      </section>

      {/* Profile & Consultation History Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Medical Profile Card */}
        <Card className="card-vessel flex flex-col justify-between">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <HeartPulse className="size-4 text-primary" />
              {t("medicalRecords.clinicalProfileTitle", "Clinical Profile")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("medicalRecords.clinicalProfileDesc", "Provide essential health details to inform your physicians during consultations")}
            </p>
          </CardHeader>
          <CardContent>
            <MedicalProfileForm profile={profile} />
          </CardContent>
        </Card>

        {/* Consultation History Card */}
        <Card className="card-vessel flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                {t("medicalRecords.consultationHistoryTitle", "Consultation History")}
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {t("medicalRecords.visitsCount", "{count} visit{plural}", {
                  count: appointments.length,
                  plural: appointments.length !== 1 ? "s" : "",
                })}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("medicalRecords.consultationHistoryDesc", "Timeline of appointments, consulting doctors, and clinical summaries")}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {appointments.length ? (
              appointments.map((appointment) => (
                <article key={appointment.id} className="rounded-xl border border-border bg-card/60 p-4 shadow-xs">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-2">
                    <h3 className="font-medium text-foreground text-sm">
                      {locale === "hi" ? "डॉ." : "Dr."} {appointment.doctor?.name || (locale === "hi" ? "डॉक्टर" : "Doctor")}
                      {appointment.doctor?.specialty && (
                        <span className="text-xs font-normal text-muted-foreground ml-1">
                          · {t(`hub.specialties.${appointment.doctor.specialty}`, appointment.doctor.specialty)}
                        </span>
                      )}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {new Date(appointment.startTime).toLocaleString(locale === "hi" ? "hi-IN" : "en-IN")}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant={appointment.status === "COMPLETED" ? "default" : "outline"} className="text-[10px]">
                      {appointment.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  {appointment.notes && (
                    <p className="mt-2.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/60">
                      {appointment.notes}
                    </p>
                  )}
                </article>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-border">
                <Clock className="size-7 text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {t("medicalRecords.emptyHistory", "Your consultation history will appear here after visits.")}
                </p>
                <Link href="/doctors" className="mt-3 text-xs font-semibold text-primary hover:underline">
                  {t("medicalRecords.findDoctorLink", "Find a doctor →")}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Prescriptions Section */}
      <Card className="card-vessel">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <FileText className="size-4 text-primary" />
              {t("medicalRecords.verifiedPrescriptionsTitle", "Verified Prescriptions & Medication Schedules")}
            </CardTitle>
            <Link href="/pharmacy" className="text-xs text-primary hover:underline flex items-center gap-1">
              {t("medicalRecords.checkPharmacy", "Check pharmacy availability")} <ArrowRight className="size-3" />
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("medicalRecords.prescriptionsDesc", "Complete treatment plans, dosage frequencies, and follow-up intervals")}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {prescriptions.length ? (
            prescriptions.map((prescription) => (
              <article key={prescription.id} className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-3">
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {locale === "hi" ? "डॉ." : "Dr."} {prescription.doctor?.name || (locale === "hi" ? "डॉक्टर" : "Doctor")}
                      {prescription.doctor?.specialty && (
                        <span className="text-xs font-normal text-muted-foreground ml-1.5">
                          ({t(`hub.specialties.${prescription.doctor.specialty}`, prescription.doctor.specialty)})
                        </span>
                      )}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("medicalRecords.diagnosis", "Diagnosis:")}{" "}
                      <span className="font-medium text-foreground">{prescription.diagnosis}</span>
                    </p>
                  </div>
                  <time className="text-xs text-muted-foreground">
                    {new Date(prescription.createdAt).toLocaleDateString(locale === "hi" ? "hi-IN" : "en-IN")}
                  </time>
                </div>

                {/* Medicines Grid */}
                <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
                  {prescription.medicines.map((medicine) => (
                    <div key={medicine.id} className="rounded-lg border border-border/70 bg-muted/40 p-3 text-xs">
                      <div className="font-semibold text-foreground">{medicine.name}</div>
                      <div className="mt-1 text-muted-foreground font-medium">
                        {medicine.dosage} · {medicine.frequency} · {medicine.duration}
                      </div>
                      {medicine.instructions && (
                        <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground/90 italic">
                          &quot;{medicine.instructions}&quot;
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {prescription.generalInstructions && (
                  <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border/50">
                    <span className="font-medium text-foreground">
                      {t("medicalRecords.physicianInstructions", "Physician Instructions:")}{" "}
                    </span>
                    {prescription.generalInstructions}
                  </p>
                )}

                {prescription.followUpRequired && prescription.followUpDays && (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary border border-primary/20">
                    <span>
                      {t("medicalRecords.followUpRecommended", "Follow-up consultation recommended within {days} days", {
                        days: prescription.followUpDays,
                      })}
                    </span>
                    <span className="font-semibold">{t("medicalRecords.includedZero", "Included at ₹0")}</span>
                  </div>
                )}
              </article>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-border">
              <FileText className="size-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium text-foreground">
                {t("medicalRecords.emptyPrescriptionsTitle", "No prescriptions on record")}
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                {t(
                  "medicalRecords.emptyPrescriptionsDesc",
                  "Prescriptions issued by your doctors during video visits or in-clinic examinations will be archived here."
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

