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
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-7 sm:px-6 sm:py-9">
      <PageHeader
        icon={<Calendar />}
        title="My Appointments"
        description="Review your consultations, join upcoming visits, and manage your schedule."
        backLink="/doctors"
        backLabel="Find Doctors"
      />

      <AnalyticsPanel title="Your consultation summary" analytics={analytics} basePath="/appointments" />

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center text-base font-semibold tracking-tight text-foreground">
            <Calendar className="mr-2 h-5 w-5 text-primary" />
            Your Scheduled Appointments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-center py-8">
              <p role="alert" className="font-medium text-destructive">Appointments could not be loaded: {error}</p>
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
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10">
                <Calendar className="size-6 text-primary" />
              </div>
              <h3 className="mb-1 text-lg font-semibold text-foreground">
                No appointments scheduled
              </h3>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                You don&apos;t have any appointments scheduled yet. Browse our
                doctors and book your first consultation.
              </p>
              <Link href="/doctors" className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline">Find a doctor <span aria-hidden="true" className="ml-1">→</span></Link>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
