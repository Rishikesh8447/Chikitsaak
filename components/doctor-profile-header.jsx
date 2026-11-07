"use client";

import React from "react";
import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/components/language-provider";

export function DoctorProfileHeader({ specialty }) {
  const { t } = useLanguage();
  const decodedSpecialty = decodeURIComponent(specialty || "");
  const specialtyLabel = t(`hub.specialties.${decodedSpecialty}`, decodedSpecialty);

  return (
    <PageHeader
      title={t("doctorProfile.profileTitle", "Doctor Profile")}
      backLink={`/doctors/${encodeURIComponent(decodedSpecialty)}`}
      backLabel={specialtyLabel}
    />
  );
}

export default DoctorProfileHeader;

