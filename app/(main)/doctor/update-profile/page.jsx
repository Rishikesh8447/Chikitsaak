import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/onboarding";
import DoctorProfileResubmissionForm from "./resubmission-form";

export default async function UpdateDoctorProfilePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") redirect("/onboarding");
  if (user.verificationStatus !== "REJECTED") redirect(user.verificationStatus === "VERIFIED" ? "/doctor" : "/doctor/verification");
  return <main className="container mx-auto max-w-3xl px-4 py-10"><DoctorProfileResubmissionForm profile={user} /></main>;
}
