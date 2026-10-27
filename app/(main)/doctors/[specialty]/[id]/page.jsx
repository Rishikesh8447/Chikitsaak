import { getDoctorById, getAvailableTimeSlots } from "@/actions/appointments";
import { DoctorProfile } from "./_components/doctor-profile";
import { getDoctorReviews } from "@/actions/medical";
import { notFound } from "next/navigation";
import { measureServerTiming } from "@/lib/server-timing.mjs";

export default async function DoctorProfilePage({ params }) {
  const { id } = await params;
  const isDirectDoctorId = typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const reviewsPromise = measureServerTiming("doctorProfile.reviews", () => getDoctorReviews(id)).catch(() => null);
  const slotsPromise = isDirectDoctorId
    ? measureServerTiming("doctorProfile.availability", () => getAvailableTimeSlots(id)).catch(() => null)
    : null;
  const doctorDataPromise = measureServerTiming("doctorProfile.doctorLookupAndName", () => getDoctorById(id));

  const doctorData = await doctorDataPromise;
  if (!doctorData.doctor) notFound();

  const [slotsData, reviewsData] = await Promise.all([
    slotsPromise || measureServerTiming("doctorProfile.availability", () => getAvailableTimeSlots(doctorData.doctor.id)),
    doctorData.doctor.id === id ? reviewsPromise : measureServerTiming("doctorProfile.reviews", () => getDoctorReviews(doctorData.doctor.id)),
  ]);
  return <DoctorProfile doctor={doctorData.doctor} availableDays={slotsData?.days || []} reviews={reviewsData} />;
}
