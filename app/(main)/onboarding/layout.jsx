import { getCurrentUser } from "@/actions/onboarding";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Onboarding - Chikitsaak",
  description: "Complete your profile to get started with Chikitsaak",
};

export default async function OnboardingLayout({ children }) {
  // Get complete user profile
  const user = await getCurrentUser();

  // Redirect users who have already completed onboarding
  if (user) {
    if (user.role === "PATIENT") {
      redirect("/doctors");
    } else if (user.role === "DOCTOR") {
      // Check verification status for doctors
      if (user.verificationStatus === "VERIFIED") {
        redirect("/doctor");
      } else {
        redirect("/doctor/verification");
      }
    } else if (user.role === "ADMIN") {
      redirect("/admin");
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <p className="eyebrow">Welcome</p>
          <h1 className="mb-2 mt-2 text-3xl font-semibold tracking-tight text-foreground">
            Welcome to Chikitsaak
          </h1>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            Tell us how you want to use the platform
          </p>
        </div>

        {children}
      </div>
    </div>
  );
}
