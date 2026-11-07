import { checkUser } from "@/lib/checkUser";
import { getPatientDashboardSummary } from "@/actions/patient-dashboard";
import { PatientCareHub } from "@/components/patient-care-hub";
import { PublicLandingView } from "@/components/public-landing-view";

export default async function Home() {
  const user = await checkUser();

  // If user is an active patient, show their personalized Vessel-inspired Patient Care Hub
  if (user?.role === "PATIENT") {
    const dashboardData = await getPatientDashboardSummary();
    return (
      <main className="min-h-dvh">
        <PatientCareHub
          user={dashboardData.user || user}
          nextAppointment={dashboardData.nextAppointment}
          recentPrescriptions={dashboardData.recentPrescriptions}
          recentLabOrders={dashboardData.recentLabOrders}
        />
      </main>
    );
  }

  // Public/Guest Vessel Clinics-inspired healthcare experience
  return (
    <main className="min-h-dvh">
      <PublicLandingView />
    </main>
  );
}
