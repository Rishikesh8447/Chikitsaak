import { redirect } from "next/navigation";
import { getDoctorsBySpecialty } from "@/actions/doctors-listing";
import { DoctorSpecialtyView } from "@/components/doctor-specialty-view";

export default async function DoctorSpecialtyPage({ params }) {
  const { specialty } = await params;

  // Redirect to main doctors page if no specialty is provided
  if (!specialty) {
    redirect("/doctors");
  }

  // Fetch doctors by specialty
  const { doctors, error } = await getDoctorsBySpecialty(specialty);

  return <DoctorSpecialtyView specialty={specialty} doctors={doctors} error={error} />;
}
