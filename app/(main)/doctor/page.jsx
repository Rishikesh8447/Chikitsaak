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
  const params = await searchParams;
  const range = params?.range || 30;

  const [appointmentsData, availabilityData, earningsData, payoutsData, analyticsData] =
    await Promise.all([
      getDoctorAppointments(),
      getDoctorAvailability(),
      getDoctorEarnings(),
      getDoctorPayouts(),
      getDoctorAnalytics(range),
    ]);

  // Redirect if not a doctor
  if (user?.role !== "DOCTOR") {
    redirect("/onboarding");
  }

  // If already verified, redirect to dashboard
  if (user?.verificationStatus !== "VERIFIED") {
    redirect("/doctor/verification");
  }

  return (
    <Tabs
      defaultValue="earnings"
      className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-6 items-start w-full min-w-0"
    >
      <TabsList className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-x-visible w-full h-auto self-start p-1.5 gap-1.5 bg-card border border-border/80 rounded-xl shadow-xs">
        <TabsTrigger
          value="earnings"
          className="flex-1 lg:flex-none flex items-center justify-center lg:justify-start px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-muted/60 data-active:bg-emerald-500/10 data-active:text-emerald-600 dark:data-active:bg-emerald-500/20 dark:data-active:text-emerald-400 data-active:font-semibold w-full"
        >
          <DollarSign className="h-4 w-4 mr-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>Earnings</span>
        </TabsTrigger>
        <TabsTrigger
          value="appointments"
          className="flex-1 lg:flex-none flex items-center justify-center lg:justify-start px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-muted/60 data-active:bg-emerald-500/10 data-active:text-emerald-600 dark:data-active:bg-emerald-500/20 dark:data-active:text-emerald-400 data-active:font-semibold w-full"
        >
          <Calendar className="h-4 w-4 mr-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>Appointments</span>
        </TabsTrigger>
        <TabsTrigger
          value="availability"
          className="flex-1 lg:flex-none flex items-center justify-center lg:justify-start px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-muted/60 data-active:bg-emerald-500/10 data-active:text-emerald-600 dark:data-active:bg-emerald-500/20 dark:data-active:text-emerald-400 data-active:font-semibold w-full"
        >
          <Clock className="h-4 w-4 mr-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>Availability</span>
        </TabsTrigger>
        <TabsTrigger
          value="analytics"
          className="flex-1 lg:flex-none flex items-center justify-center lg:justify-start px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-muted/60 data-active:bg-emerald-500/10 data-active:text-emerald-600 dark:data-active:bg-emerald-500/20 dark:data-active:text-emerald-400 data-active:font-semibold w-full"
        >
          <BarChart3 className="h-4 w-4 mr-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>Analytics</span>
        </TabsTrigger>
      </TabsList>

      <div className="min-w-0 w-full space-y-6">
        <PageHeader icon={<Stethoscope />} title="Doctor Dashboard" />

        <TabsContent value="appointments" className="border-none p-0 mt-0">
          <DoctorAppointmentsList
            appointments={appointmentsData.appointments || []}
          />
        </TabsContent>
        <TabsContent value="availability" className="border-none p-0 mt-0">
          <AvailabilitySettings slots={availabilityData.slots || []} />
        </TabsContent>
        <TabsContent value="earnings" className="border-none p-0 mt-0">
          <DoctorEarnings
            earnings={earningsData.earnings || {}}
            payouts={payoutsData.payouts || []}
          />
        </TabsContent>
        <TabsContent value="analytics" className="border-none p-0 mt-0">
          <AnalyticsPanel title="Doctor analytics" analytics={analyticsData} basePath="/doctor" />
        </TabsContent>
      </div>
    </Tabs>
  );
}
