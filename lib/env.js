/**
 * Validate deployment configuration without ever returning secret values.
 * This helper is intentionally non-throwing so optional providers do not make
 * local development unusable; callers can decide which capabilities to gate.
 */
export function getEnvironmentStatus() {
  const required = [
    "DATABASE_URL",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
    "NEXT_PUBLIC_VONAGE_APPLICATION_ID",
    "VONAGE_PRIVATE_KEY",
    "OPENAI_API_KEY",
    "CRON_SECRET",
  ];

  const missing = required.filter((name) => !process.env[name]);

  return {
    missing,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    isProduction: process.env.NODE_ENV === "production",
  };
}
