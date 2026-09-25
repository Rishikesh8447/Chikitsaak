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
  return <main className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
    <PageHeader icon={<HeartPulse />} title="My Medical Records" backLink="/appointments" backLabel="Appointments" />
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Medical Profile</CardTitle></CardHeader><CardContent><MedicalProfileForm profile={profile} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Consultation History</CardTitle></CardHeader><CardContent className="space-y-2">
        {appointments.length ? appointments.map((appointment) => <div key={appointment.id} className="rounded-lg border border-border/80 p-3"><div className="font-medium text-foreground">Dr. {appointment.doctor.name || "Doctor"}</div><div className="text-sm text-muted-foreground">{new Date(appointment.startTime).toLocaleString()} · {appointment.status}</div>{appointment.notes && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{appointment.notes}</p>}</div>) : <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">Your medical records will appear here after your consultations.</p>}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-500" />Prescriptions</CardTitle></CardHeader><CardContent className="space-y-3">
      {prescriptions.length ? prescriptions.map((prescription) => <div key={prescription.id} className="rounded-lg border border-border/80 p-4"><div className="flex flex-wrap justify-between gap-2"><div className="font-medium text-foreground">Dr. {prescription.doctor.name || "Doctor"}</div><div className="text-sm text-muted-foreground">{new Date(prescription.createdAt).toLocaleDateString()}</div></div><p className="mt-2 text-sm text-foreground"><span className="text-muted-foreground">Diagnosis:</span> {prescription.diagnosis}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{prescription.medicines.map((medicine) => <div key={medicine.id} className="rounded-lg bg-muted/50 p-3 text-sm"><div className="font-medium text-foreground">{medicine.name}</div><div className="text-muted-foreground">{medicine.dosage} · {medicine.frequency} · {medicine.duration}</div>{medicine.instructions && <div className="mt-1 text-muted-foreground">{medicine.instructions}</div>}</div>)}</div>{prescription.generalInstructions && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{prescription.generalInstructions}</p>}</div>) : <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">No prescriptions available yet.</p>}
    </CardContent></Card>
  </main>;
}
