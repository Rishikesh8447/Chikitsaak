import { getDoctorById, getAvailableTimeSlots } from "@/actions/appointments";
import { DoctorProfile } from "./_components/doctor-profile";
import { getDoctorReviews } from "@/actions/medical";
import { notFound } from "next/navigation";

export default async function DoctorProfilePage({ params }) {
  const { id } = await params;

  const doctorData = await getDoctorById(id);
  if (!doctorData.doctor) notFound();
  const [slotsData, reviewsData] = await Promise.all([
    getAvailableTimeSlots(doctorData.doctor.id),
    getDoctorReviews(doctorData.doctor.id),
  ]);
  return <DoctorProfile doctor={doctorData.doctor} availableDays={slotsData.days || []} reviews={reviewsData} />;
}
