import { getPatientAppointments } from "@/actions/patient";
import Link from "next/link";
import { AppointmentCard } from "@/components/ui/appointment-card";
import { PageHeader } from "@/components/page-header";
import { Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/onboarding";
import { getPatientAnalytics } from "@/actions/analytics";
import { AnalyticsPanel } from "@/components/analytics-panel";

export default async function PatientAppointmentsPage({ searchParams }) {
  const user = await getCurrentUser();

  if (!user || user.role !== "PATIENT") {
    redirect("/onboarding");
  }

  const params = await searchParams;
  const range = params?.range || 30;
  const [{ appointments, error }, analytics] = await Promise.all([getPatientAppointments(), getPatientAnalytics(range)]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        icon={<Calendar />}
        title="My Appointments"
        backLink="/doctors"
        backLabel="Find Doctors"
      />

      <AnalyticsPanel title="Your consultation summary" analytics={analytics} basePath="/appointments" />

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-slate-900 dark:text-white flex items-center">
            <Calendar className="mr-2 h-5 w-5 text-primary" />
            Your Scheduled Appointments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-center py-8">
              <p className="text-red-500 font-medium">Error: {error}</p>
            </div>
          ) : appointments?.length > 0 ? (
            <div className="space-y-4">
              {appointments.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  userRole="PATIENT"
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-10 px-4">
              <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-4 rounded-full mb-3">
                <Calendar className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                No appointments scheduled
              </h3>
              <p className="text-slate-600 dark:text-slate-300 text-sm max-w-sm">
                You don&apos;t have any appointments scheduled yet. Browse our
                doctors and book your first consultation.
              </p>
              <Link href="/doctors" className="mt-4 inline-flex text-sm font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400">Find a doctor &rarr;</Link>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
