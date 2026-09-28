import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getDoctorAppointments, getDoctorAvailability } from "@/actions/doctor";
import { AvailabilitySettings } from "./_components/availability-settings";
import { getCurrentUser } from "@/actions/onboarding";
import { redirect } from "next/navigation";
import { Calendar, Clock, DollarSign, BarChart3, Stethoscope } from "lucide-react";
import DoctorAppointmentsList from "./_components/appointments-list";
import { getDoctorEarnings, getDoctorPayouts } from "@/actions/payout";
import { DoctorEarnings } from "./_components/doctor-earnings";
import { getDoctorAnalytics } from "@/actions/analytics";
import { AnalyticsPanel } from "@/components/analytics-panel";
import { PageHeader } from "@/components/page-header";

export default async function DoctorDashboardPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    redirect("/onboarding");
  }
  if (user?.verificationStatus !== "VERIFIED") {
    redirect("/doctor/verification");
  }

  const params = await searchParams;
  const range = params?.range || 30;
  const [appointmentsData, availabilityData, earningsData, payoutsData, analyticsData] = await Promise.all([
    getDoctorAppointments(),
    getDoctorAvailability(),
    getDoctorEarnings(),
    getDoctorPayouts(),
    getDoctorAnalytics(range),
  ]);

  const doctorAppointments = appointmentsData.appointments || [];
  const today = new Date();
  const todayAppointments = doctorAppointments.filter((appointment) => {
    const date = new Date(appointment.startTime);
    return date.toDateString() === today.toDateString();
  });
  const upcomingAppointments = doctorAppointments.filter((appointment) => ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"].includes(appointment.status));
  const completedAppointments = doctorAppointments.filter((appointment) => appointment.status === "COMPLETED");

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8"><Tabs defaultValue="appointments" className="!grid w-full min-w-0">
      <div className="grid w-full min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="min-w-0 lg:sticky lg:top-24">
          <TabsList aria-label="Doctor workspace" className="flex h-auto w-full min-w-0 max-w-full flex-row gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 shadow-xs lg:sticky lg:top-28 lg:flex-col lg:items-stretch lg:overflow-visible lg:h-auto">
            <TabsTrigger
              value="earnings"
              className="flex min-h-10 min-w-[130px] flex-1 items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-active:bg-primary/10 data-active:font-semibold data-active:text-primary lg:min-w-0 lg:flex-none lg:justify-start lg:h-auto"
            >
              <DollarSign className="mr-2.5 h-4 w-4 shrink-0" />
              <span>Earnings</span>
            </TabsTrigger>
            <TabsTrigger
              value="appointments"
              className="flex min-h-10 min-w-[140px] flex-1 items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-active:bg-primary/10 data-active:font-semibold data-active:text-primary lg:min-w-0 lg:flex-none lg:justify-start lg:h-auto"
            >
              <Calendar className="mr-2.5 h-4 w-4 shrink-0" />
              <span>Appointments</span>
            </TabsTrigger>
            <TabsTrigger
              value="availability"
              className="flex min-h-10 min-w-[140px] flex-1 items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-active:bg-primary/10 data-active:font-semibold data-active:text-primary lg:min-w-0 lg:flex-none lg:justify-start lg:h-auto"
            >
              <Clock className="mr-2.5 h-4 w-4 shrink-0" />
              <span>Availability</span>
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="flex min-h-10 min-w-[140px] flex-1 items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-active:bg-primary/10 data-active:font-semibold data-active:text-primary lg:min-w-0 lg:flex-none lg:justify-start lg:h-auto"
            >
              <BarChart3 className="mr-2.5 h-4 w-4 shrink-0" />
              <span>Analytics</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-w-0 w-full space-y-6">
          <PageHeader icon={<Stethoscope />} title={`Welcome, Dr. ${user.name || "Doctor"}`} description="Your practice overview and upcoming work." backLink={null} />
          <section aria-label="Practice summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Today&apos;s appointments</p><p className="mt-1 text-2xl font-semibold tracking-tight">{todayAppointments.length}</p></div>
            <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Upcoming</p><p className="mt-1 text-2xl font-semibold tracking-tight">{upcomingAppointments.length}</p></div>
            <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Completed</p><p className="mt-1 text-2xl font-semibold tracking-tight">{completedAppointments.length}</p></div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4"><p className="text-xs text-muted-foreground">Eligible credits</p><p className="mt-1 text-2xl font-semibold tracking-tight text-primary">{earningsData.earnings?.availableCredits || 0}</p></div>
          </section>

          <TabsContent value="appointments" className="mt-0 border-none p-0">
            <DoctorAppointmentsList
              appointments={doctorAppointments}
            />
          </TabsContent>
          <TabsContent value="availability" className="mt-0 border-none p-0">
            <AvailabilitySettings slots={availabilityData.slots || []} />
          </TabsContent>
          <TabsContent value="earnings" className="mt-0 border-none p-0">
            <DoctorEarnings
              earnings={earningsData.earnings || {}}
              payouts={payoutsData.payouts || []}
            />
          </TabsContent>
          <TabsContent value="analytics" className="mt-0 border-none p-0">
            <AnalyticsPanel title="Doctor analytics" analytics={analyticsData} basePath="/doctor" />
          </TabsContent>
        </div>
      </div>
    </Tabs></main>
  );
}
