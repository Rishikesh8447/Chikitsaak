import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/onboarding";
import { getMyMedicalRecords } from "@/actions/medical";
import { PatientMedicalRecordsView } from "@/components/patient-medical-records-view";

export const metadata = {
  title: "Medical Dossier & Records — Chikitsaak",
  description: "Manage your confidential health profile, consultation history, and doctor prescriptions.",
};

export default async function MedicalRecordsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PATIENT") redirect("/onboarding");
  const { profile, appointments, prescriptions } = await getMyMedicalRecords();

  return (
    <PatientMedicalRecordsView
      profile={profile}
      appointments={appointments}
      prescriptions={prescriptions}
    />
  );
}
