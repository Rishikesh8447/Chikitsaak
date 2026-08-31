import { getDoctorById, getAvailableTimeSlots } from "@/actions/appointments";
import { DoctorProfile } from "./_components/doctor-profile";
import { getDoctorReviews } from "@/actions/medical";

export default async function DoctorProfilePage({ params }) {
  const { id } = await params;

  const [doctorData, slotsData, reviewsData] = await Promise.all([
    getDoctorById(id),
    getAvailableTimeSlots(id),
    getDoctorReviews(id),
  ]);
  return <DoctorProfile doctor={doctorData.doctor} availableDays={slotsData.days || []} reviews={reviewsData} />;
}
