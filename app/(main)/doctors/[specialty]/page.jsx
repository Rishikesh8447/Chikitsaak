import { redirect } from "next/navigation";
import { getDoctorsBySpecialty } from "@/actions/doctors-listing";
import { DoctorCard } from "@/components/doctor-card";
import { PageHeader } from "@/components/page-header";

export default async function DoctorSpecialtyPage({ params }) {
  const { specialty } = await params;

  // Redirect to main doctors page if no specialty is provided
  if (!specialty) {
    redirect("/doctors");
  }

  // Fetch doctors by specialty
  const { doctors, error } = await getDoctorsBySpecialty(specialty);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-7 sm:px-6 sm:py-9">
      <PageHeader
        title={specialty.split("%20").join(" ")}
        description="Verified doctors in this specialty. Review their profiles and choose an available consultation time."
        backLink="/doctors"
        backLabel="All Specialties"
      />

      {error ? (
        <div role="alert" className="rounded-md border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">We couldn&apos;t load doctors in this specialty. Please try again later.</div>
      ) : doctors && doctors.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {doctors.map((doctor) => (
            <DoctorCard key={doctor.id} doctor={doctor} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center">
          <h3 className="mb-2 text-lg font-semibold text-foreground">
            No doctors available
          </h3>
          <p className="text-muted-foreground">
            There are currently no verified doctors in this specialty. Please
            check back later or choose another specialty.
          </p>
        </div>
      )}
    </main>
  );
}
