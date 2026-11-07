"use client";

import { useLanguage } from "./language-provider";
import { Languages } from "lucide-react";

/**
 * Patient-facing language switcher.
 * Hidden for DOCTOR and ADMIN users to maintain strict workspace isolation.
 */
export function LanguageToggle({ userRole, className = "" }) {
  const { locale, setLocale, mounted, isStaff } = useLanguage();

  // Strict role isolation: Do not render for administrative or clinical workspaces
  if (userRole === "DOCTOR" || userRole === "ADMIN" || isStaff) {
    return null;
  }

  if (!mounted) {
    return (
      <button
        type="button"
        disabled
        aria-label="Loading language switcher"
        className={`inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground ${className}`}
      >
        <Languages className="size-3.5 text-muted-foreground" />
        <span>EN</span>
      </button>
    );
  }

  const isHindi = locale === "hi";
  const nextLocale = isHindi ? "en" : "hi";
  const ariaLabel = isHindi ? "Switch to English" : "हिंदी में बदलें";
  const title = isHindi ? "Switch to English (अंग्रेज़ी)" : "Switch to Hindi (हिंदी)";

  return (
    <button
      type="button"
      onClick={() => setLocale(nextLocale)}
      aria-label={ariaLabel}
      title={title}
      className={`inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
    >
      <Languages className="size-3.5 text-primary" />
      <span className="font-semibold">{isHindi ? "हिंदी" : "EN"}</span>
    </button>
  );
}

/**
 * Translates patient-specific navigation labels when active for patients/guests.
 * Strictly preserves doctor and admin labels in their canonical English form.
 */
export function PatientNavLabel({ label, isPatient = false }) {
  const { t } = useLanguage();

  if (!isPatient) {
    return label;
  }

  switch (label) {
    case "Find care":
      return t("nav.findCare", label);
    case "Appointments":
      return t("nav.appointments", label);
    case "Medical records":
      return t("nav.medicalRecords", label);
    case "Lab tests":
      return t("nav.labTests", label);
    case "Pharmacy":
      return t("nav.pharmacy", label);
    default:
      return label;
  }
}

/**
 * Client component for footer translation without turning RootLayout into a client component.
 */
export function FooterContent({ userRole }) {
  const { t, isStaff } = useLanguage();
  const staff = isStaff || userRole === "DOCTOR" || userRole === "ADMIN";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="font-medium text-foreground">
        Chikitsaak <span className="font-normal text-muted-foreground">· {staff ? "Care, Connected" : t("footer.tagline", "Care, Connected")}</span>
      </p>
      <p>{staff ? "Private, considered care for every step of your health journey." : t("footer.description", "Private, considered care for every step of your health journey.")}</p>
    </div>
  );
}

