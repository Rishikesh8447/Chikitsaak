import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/onboarding";
import { getAvailablePharmacyProducts, getPatientDispensingRequests } from "@/actions/pharmacy";
import { getMyMedicalRecords } from "@/actions/medical";
import { PatientPharmacyView } from "@/components/patient-pharmacy-view";

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
    <PatientPharmacyView
      products={products}
      prescriptions={prescriptions}
      dispensingRequests={dispensingRequests}
    />
  );
}
