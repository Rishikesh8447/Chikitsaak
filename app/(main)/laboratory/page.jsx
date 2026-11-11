import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/onboarding";
import { getAvailableLaboratoryTests, getMyLabOrders } from "@/actions/laboratory";
import { PatientLaboratoryView } from "@/components/patient-laboratory-view";

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
    <PatientLaboratoryView
      orders={orders}
      eligibleLabs={eligibleLabs}
      laboratories={laboratories}
    />
  );
}
