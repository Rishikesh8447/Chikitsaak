"use client";

import Link from "next/link";
import { AppointmentCard } from "@/components/ui/appointment-card";
import { PageHeader } from "@/components/page-header";
import { Calendar, CalendarCheck, AlertCircle, ArrowRight, HeartPulse } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsPanel } from "@/components/analytics-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "./language-provider";

export function PatientAppointmentsView({
  appointments = [],
  error,
  analytics,
  completedParam,
}) {
  const { t } = useLanguage();

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
        identity={{ label: t("appointments.dashboardBadge", "Patient Dashboard"), icon: HeartPulse }}
        icon={<Calendar />}
        title={t("appointments.title", "Consultations & Appointments")}
        description={t("appointments.description", "Review your visits, join scheduled video consultations, and manage your healthcare timetable.")}
        backLink="/doctors"
        backLabel={t("appointments.backLabel", "Find Doctors")}
      />

      {/* Analytics Summary */}
      <AnalyticsPanel title={t("appointments.summaryTitle", "Your consultation summary")} analytics={analytics} basePath="/appointments" />

      {/* Main Appointment Management Card */}
      <Card className="card-vessel">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center text-lg font-semibold tracking-tight text-foreground">
              <Calendar className="mr-2.5 size-5 text-primary" />
              {t("appointments.scheduleTitle", "Your Consultation Schedule")}
            </CardTitle>
            <Link
              href="/doctors"
              className="inline-flex items-center text-xs font-semibold text-primary hover:underline"
            >
              {t("appointments.bookNew", "Book new consultation")} <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </div>
        </CardHeader>

        <CardContent>
          {completedParam && (
            <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-3.5 flex items-center justify-between gap-3 text-xs text-foreground">
              <div className="flex items-center gap-2">
                <CalendarCheck className="size-4 text-primary shrink-0" />
                <span>{t("appointments.concludedBanner", "Consultation concluded. You can review your doctor, inspect advised medicines, or book a follow-up visit.")}</span>
              </div>
            </div>
          )}

          {error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center">
              <AlertCircle className="mx-auto size-6 text-destructive mb-2" />
              <p role="alert" className="text-sm font-medium text-destructive">
                {t("appointments.loadError", "Appointments could not be loaded:")} {error}
              </p>
            </div>
          ) : allAppointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Calendar className="size-7" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {t("appointments.noAppointmentsTitle", "No consultations scheduled yet")}
              </h3>
              <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {t("appointments.noAppointmentsDesc", "Connect with verified physicians across 12+ specialties for 20-minute video visits or scheduled in-clinic care.")}
              </p>
              <Link
                href="/doctors"
                className="mt-5 inline-flex items-center rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90"
              >
                {t("appointments.browseDoctorsBtn", "Browse doctors & book visit")}
              </Link>
            </div>
          ) : (
            <Tabs defaultValue={completedParam ? "completed" : "upcoming"} className="w-full">
              <TabsList className="mb-5 grid w-full max-w-md grid-cols-3">
                <TabsTrigger value="upcoming" className="text-xs">
                  {t("appointments.upcomingTab", "Upcoming")} ({upcomingAppointments.length})
                </TabsTrigger>
                <TabsTrigger value="completed" className="text-xs">
                  {t("appointments.completedTab", "Completed")} ({completedAppointments.length})
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs">
                  {t("appointments.cancelledTab", "Cancelled")} ({pastOrCancelledAppointments.length})
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
                    <p className="text-sm font-medium text-foreground">{t("appointments.noUpcomingTitle", "No upcoming appointments")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("appointments.noUpcomingDesc", "You have no upcoming consultations scheduled.")}
                    </p>
                    <Link href="/doctors" className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">
                      {t("appointments.findCareLink", "Find care →")}
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
                      initialOpen={appointment.id === completedParam}
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <p className="text-sm font-medium text-foreground">{t("appointments.noCompletedTitle", "No past visits")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("appointments.noCompletedDesc", "Completed consultations with doctor notes will be archived here.")}
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
                    <p className="text-sm font-medium text-foreground">{t("appointments.noCancelledTitle", "No cancelled appointments")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("appointments.noCancelledDesc", "Cancelled or missed appointments will be recorded here.")}
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

