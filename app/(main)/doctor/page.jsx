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
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6"><Tabs defaultValue="appointments" className="!grid w-full min-w-0">
      <div className="grid w-full min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="min-w-0 lg:sticky lg:top-24">
          <TabsList className="flex min-w-0 max-w-full h-auto w-full flex-row gap-1 overflow-x-auto border-r border-border bg-transparent p-0 pr-3 lg:flex-col lg:overflow-visible">
            <TabsTrigger
              value="earnings"
              className="flex min-w-[130px] flex-1 items-center justify-center rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all text-slate-600 hover:bg-muted/60 hover:text-slate-900 data-active:bg-emerald-500/10 data-active:font-semibold data-active:text-emerald-600 dark:text-slate-300 dark:hover:text-white dark:data-active:bg-emerald-500/20 dark:data-active:text-emerald-400 lg:min-w-0 lg:flex-none lg:justify-start"
            >
              <DollarSign className="mr-2.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Earnings</span>
            </TabsTrigger>
            <TabsTrigger
              value="appointments"
              className="flex min-w-[140px] flex-1 items-center justify-center rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all text-slate-600 hover:bg-muted/60 hover:text-slate-900 data-active:bg-emerald-500/10 data-active:font-semibold data-active:text-emerald-600 dark:text-slate-300 dark:hover:text-white dark:data-active:bg-emerald-500/20 dark:data-active:text-emerald-400 lg:min-w-0 lg:flex-none lg:justify-start"
            >
              <Calendar className="mr-2.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Appointments</span>
            </TabsTrigger>
            <TabsTrigger
              value="availability"
              className="flex min-w-[140px] flex-1 items-center justify-center rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all text-slate-600 hover:bg-muted/60 hover:text-slate-900 data-active:bg-emerald-500/10 data-active:font-semibold data-active:text-emerald-600 dark:text-slate-300 dark:hover:text-white dark:data-active:bg-emerald-500/20 dark:data-active:text-emerald-400 lg:min-w-0 lg:flex-none lg:justify-start"
            >
              <Clock className="mr-2.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Availability</span>
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="flex min-w-[140px] flex-1 items-center justify-center rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all text-slate-600 hover:bg-muted/60 hover:text-slate-900 data-active:bg-emerald-500/10 data-active:font-semibold data-active:text-emerald-600 dark:text-slate-300 dark:hover:text-white dark:data-active:bg-emerald-500/20 dark:data-active:text-emerald-400 lg:min-w-0 lg:flex-none lg:justify-start"
            >
              <BarChart3 className="mr-2.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Analytics</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-w-0 w-full space-y-6">
          <PageHeader icon={<Stethoscope />} title={`Good morning, Dr. ${user.name || "Doctor"}`} />
          <p className="-mt-4 text-sm text-muted-foreground">Here&apos;s your practice overview.</p>
          <section aria-label="Practice summary" className="grid grid-cols-2 divide-x divide-border border-y border-border py-4 sm:grid-cols-4">
            <div className="px-3 first:pl-0"><p className="text-xs text-muted-foreground">Today&apos;s appointments</p><p className="mt-1 text-2xl font-semibold">{todayAppointments.length}</p></div>
            <div className="px-3"><p className="text-xs text-muted-foreground">Upcoming</p><p className="mt-1 text-2xl font-semibold">{upcomingAppointments.length}</p></div>
            <div className="px-3"><p className="text-xs text-muted-foreground">Completed</p><p className="mt-1 text-2xl font-semibold">{completedAppointments.length}</p></div>
            <div className="px-3 last:pr-0"><p className="text-xs text-muted-foreground">Available credits</p><p className="mt-1 text-2xl font-semibold text-primary">{earningsData.earnings?.availableCredits || 0}</p></div>
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
