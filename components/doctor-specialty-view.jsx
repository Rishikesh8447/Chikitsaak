"use client";

import { PageHeader } from "@/components/page-header";
import { DoctorCard } from "@/components/doctor-card";
import { useLanguage } from "./language-provider";

export function DoctorSpecialtyView({ specialty, doctors = [], error }) {
  const { t } = useLanguage();
  const displayName = specialty ? specialty.split("%20").join(" ") : "";

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-7 sm:px-6 sm:py-9">
      <PageHeader
        title={t(`hub.specialties.${displayName}`, displayName)}
        description={t("specialtyView.description", "Verified doctors in this specialty. Review their profiles and choose an available consultation time.")}
        backLink="/doctors"
        backLabel={t("specialtyView.backLabel", "All Specialties")}
      />

      {error ? (
        <div role="alert" className="rounded-md border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
          {t("specialtyView.error", "We couldn't load doctors in this specialty. Please try again later.")}
        </div>
      ) : doctors && doctors.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {doctors.map((doctor) => (
            <DoctorCard key={doctor.id} doctor={doctor} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center">
          <h3 className="mb-2 text-lg font-semibold text-foreground">
            {t("specialtyView.emptyTitle", "No doctors available")}
          </h3>
          <p className="text-muted-foreground">
            {t("specialtyView.emptyDesc", "There are currently no verified doctors in this specialty. Please check back later or choose another specialty.")}
          </p>
        </div>
      )}
    </main>
  );
}

