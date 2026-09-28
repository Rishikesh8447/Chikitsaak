import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/onboarding";
import { getMyMedicalRecords } from "@/actions/medical";
import { MedicalProfileForm } from "@/components/medical-profile-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { FileText, HeartPulse } from "lucide-react";

export default async function MedicalRecordsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PATIENT") redirect("/onboarding");
  const { profile, appointments, prescriptions } = await getMyMedicalRecords();

  return <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-7 sm:px-6 sm:py-9">
    <PageHeader icon={<HeartPulse />} title="Medical records" description="Keep your health information and consultation documents together." backLink="/appointments" backLabel="Appointments" />
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Medical profile</CardTitle></CardHeader><CardContent><MedicalProfileForm profile={profile} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Consultation history</CardTitle></CardHeader><CardContent className="space-y-3">
        {appointments.length ? appointments.map((appointment) => <article key={appointment.id} className="rounded-md border border-border p-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-medium text-foreground">Dr. {appointment.doctor.name || "Doctor"}</h3><span className="text-xs text-muted-foreground">{new Date(appointment.startTime).toLocaleString()}</span></div><p className="mt-1 text-xs text-muted-foreground">{appointment.status.replaceAll("_", " ")}</p>{appointment.notes && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{appointment.notes}</p>}</article>) : <p className="rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">Your consultation history will appear here after your visits.</p>}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="size-4 text-primary" />Prescriptions</CardTitle></CardHeader><CardContent className="space-y-3">
      {prescriptions.length ? prescriptions.map((prescription) => <article key={prescription.id} className="rounded-md border border-border p-4 sm:p-5"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium text-foreground">Dr. {prescription.doctor.name || "Doctor"}</h3><time className="text-xs text-muted-foreground">{new Date(prescription.createdAt).toLocaleDateString()}</time></div><p className="mt-3 text-sm"><span className="text-muted-foreground">Diagnosis: </span>{prescription.diagnosis}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{prescription.medicines.map((medicine) => <div key={medicine.id} className="rounded-md bg-muted/60 p-3 text-sm"><div className="font-medium text-foreground">{medicine.name}</div><div className="mt-1 text-muted-foreground">{medicine.dosage} · {medicine.frequency} · {medicine.duration}</div>{medicine.instructions && <div className="mt-1 text-xs leading-5 text-muted-foreground">{medicine.instructions}</div>}</div>)}</div>{prescription.generalInstructions && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{prescription.generalInstructions}</p>}</article>) : <p className="rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">Prescriptions from your consultations will appear here when available.</p>}
    </CardContent></Card>
  </main>;
}
