import { getDoctorById, getAvailableTimeSlots } from "@/actions/appointments";
import { DoctorProfile } from "./_components/doctor-profile";
import { getDoctorReviews } from "@/actions/medical";
import { notFound } from "next/navigation";
import { measureServerTiming } from "@/lib/server-timing.mjs";

export default async function DoctorProfilePage({ params }) {
  const { id } = await params;

  const doctorData = await measureServerTiming("doctorProfile.doctorLookupAndName", () => getDoctorById(id));
  if (!doctorData?.doctor) notFound();

  const [slotsData, reviewsData] = await Promise.all([
    measureServerTiming("doctorProfile.availability", () =>
      getAvailableTimeSlots(doctorData.doctor.id, undefined, doctorData.doctor)
    ).catch(() => null),
    measureServerTiming("doctorProfile.reviews", () =>
      getDoctorReviews(doctorData.doctor.id)
    ).catch(() => null),
  ]);

  const { [Symbol.for("chikitsaak.verifiedDoctor")]: _tag, ...clientDoctor } = doctorData.doctor;

  return <DoctorProfile doctor={clientDoctor} availableDays={slotsData?.days || []} reviews={reviewsData} />;
}
