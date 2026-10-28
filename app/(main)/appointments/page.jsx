import { getPatientAppointments } from "@/actions/patient";
import Link from "next/link";
import { AppointmentCard } from "@/components/ui/appointment-card";
import { PageHeader } from "@/components/page-header";
import { Calendar, CalendarCheck, Clock, History, AlertCircle, ArrowRight, ShieldCheck, HeartPulse } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/onboarding";
import { getPatientAnalytics } from "@/actions/analytics";
import { AnalyticsPanel } from "@/components/analytics-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata = {
  title: "My Consultations & Appointments — Chikitsaak",
  description: "Review scheduled doctor visits, join secure video consultations, and manage your health schedule.",
};

export default async function PatientAppointmentsPage({ searchParams }) {
  const user = await getCurrentUser();

  if (!user || user.role !== "PATIENT") {
    redirect("/onboarding");
  }

  const params = await searchParams;
  const range = params?.range || 30;
  const [{ appointments, error }, analytics] = await Promise.all([
    getPatientAppointments(),
    getPatientAnalytics(range),
  ]);

  const allAppointments = appointments || [];

  const upcomingAppointments = allAppointments.filter((a) =>
    ["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "PAYMENT_PENDING"].includes(a.status)
  );

  const completedAppointments = allAppointments.filter((a) =>
    a.status === "COMPLETED"
  );

  const pastOrCancelledAppointments = allAppointments.filter((a) =>
    ["CANCELLED", "NO_SHOW"].includes(a.status)
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-7 px-4 py-7 sm:px-6 sm:py-9">
      <PageHeader
        identity={{ label: "Patient Dashboard", icon: HeartPulse }}
        icon={<Calendar />}
        title="Consultations & Appointments"
        description="Review your visits, join scheduled video consultations, and manage your healthcare timetable."
        backLink="/doctors"
        backLabel="Find Doctors"
      />

      {/* Analytics Summary */}
      <AnalyticsPanel title="Your consultation summary" analytics={analytics} basePath="/appointments" />

      {/* Main Appointment Management Card */}
      <Card className="card-vessel">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center text-lg font-semibold tracking-tight text-foreground">
              <Calendar className="mr-2.5 size-5 text-primary" />
              Your Consultation Schedule
            </CardTitle>
            <Link
              href="/doctors"
              className="inline-flex items-center text-xs font-semibold text-primary hover:underline"
            >
              Book new consultation <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </div>
        </CardHeader>

        <CardContent>
          {params?.completed && (
            <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-3.5 flex items-center justify-between gap-3 text-xs text-foreground">
              <div className="flex items-center gap-2">
                <CalendarCheck className="size-4 text-primary shrink-0" />
                <span>Consultation concluded. You can review your doctor, inspect advised medicines, or book a follow-up visit.</span>
              </div>
            </div>
          )}

          {error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center">
              <AlertCircle className="mx-auto size-6 text-destructive mb-2" />
              <p role="alert" className="text-sm font-medium text-destructive">
                Appointments could not be loaded: {error}
              </p>
            </div>
          ) : allAppointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Calendar className="size-7" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                No consultations scheduled yet
              </h3>
              <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Connect with verified physicians across 12+ specialties for 20-minute video visits or scheduled in-clinic care.
              </p>
              <Link
                href="/doctors"
                className="mt-5 inline-flex items-center rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90"
              >
                Browse doctors & book visit
              </Link>
            </div>
          ) : (
            <Tabs defaultValue={params?.completed ? "completed" : "upcoming"} className="w-full">
              <TabsList className="mb-5 grid w-full max-w-md grid-cols-3">
                <TabsTrigger value="upcoming" className="text-xs">
                  Upcoming ({upcomingAppointments.length})
                </TabsTrigger>
                <TabsTrigger value="completed" className="text-xs">
                  Completed ({completedAppointments.length})
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs">
                  Cancelled ({pastOrCancelledAppointments.length})
                </TabsTrigger>
              </TabsList>

              {/* Upcoming Tab */}
              <TabsContent value="upcoming" className="space-y-4">
                {upcomingAppointments.length > 0 ? (
                  upcomingAppointments.map((appointment) => (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      userRole="PATIENT"
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <p className="text-sm font-medium text-foreground">No upcoming appointments</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      You have no upcoming consultations scheduled.
                    </p>
                    <Link href="/doctors" className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">
                      Find care →
                    </Link>
                  </div>
                )}
              </TabsContent>

              {/* Completed Tab */}
              <TabsContent value="completed" className="space-y-4">
                {completedAppointments.length > 0 ? (
                  completedAppointments.map((appointment) => (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      userRole="PATIENT"
                      initialOpen={appointment.id === params?.completed}
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <p className="text-sm font-medium text-foreground">No past visits</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Completed consultations with doctor notes will be archived here.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Cancelled/History Tab */}
              <TabsContent value="history" className="space-y-4">
                {pastOrCancelledAppointments.length > 0 ? (
                  pastOrCancelledAppointments.map((appointment) => (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      userRole="PATIENT"
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <p className="text-sm font-medium text-foreground">No cancelled appointments</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cancelled or missed appointments will be recorded here.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
