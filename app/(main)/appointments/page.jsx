import { getPatientAppointments } from "@/actions/patient";
import { getCurrentUser } from "@/actions/onboarding";
import { getPatientAnalytics } from "@/actions/analytics";
import { redirect } from "next/navigation";
import { PatientAppointmentsView } from "@/components/patient-appointments-view";

export const metadata = {
  title: "My Consultations & Appointments — Chikitsaak",
  description: "Review scheduled doctor visits, join secure video consultations, and manage your health schedule.",
};

export default async function PatientAppointmentsPage({ searchParams }) {
  const user = await getCurrentUser();

  if (!user || user.role !== "PATIENT") {
    redirect("/onboarding");
  }

  const params = await searchParams;
  const range = params?.range || 30;
  const [{ appointments, error }, analytics] = await Promise.all([
    getPatientAppointments(),
    getPatientAnalytics(range),
  ]);

  return (
    <PatientAppointmentsView
      appointments={appointments}
      error={error}
      analytics={analytics}
      completedParam={params?.completed}
    />
  );
}
