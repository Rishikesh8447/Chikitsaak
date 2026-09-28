import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/onboarding";
import DoctorProfileResubmissionForm from "./resubmission-form";
import { PageHeader } from "@/components/page-header";

export default async function UpdateDoctorProfilePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") redirect("/onboarding");
  if (user.verificationStatus !== "REJECTED") redirect(user.verificationStatus === "VERIFIED" ? "/doctor" : "/doctor/verification");
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8"><PageHeader title="Update your doctor profile" description="Revise your professional information and send it for verification again." backLink="/doctor/verification" backLabel="Verification status" /><DoctorProfileResubmissionForm profile={user} /></main>;
}
