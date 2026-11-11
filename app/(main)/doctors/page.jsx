import { searchDoctors } from "@/actions/doctors-listing";
import { DoctorsDirectoryView } from "@/components/doctors-directory-view";

export const revalidate = 60;

export const metadata = {
  title: "Find Certified Physicians & Specialists — Chikitsaak",
  description: "Browse verified clinicians across medical specialties. Book dedicated 20-minute video or clinic consultations.",
};

export default async function DoctorsPage() {
  const { doctors } = await searchDoctors();

  return <DoctorsDirectoryView initialDoctors={doctors} />;
}
