import { verifyAdmin } from "@/actions/admin";
import { redirect } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Users, CreditCard, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Admin Settings - Chikitsaak",
  description: "Manage doctors, patients, and platform settings",
};

export default async function AdminLayout({ children }) {
  // Verify the user has admin access
  const isAdmin = await verifyAdmin();

  // Redirect if not an admin
  if (!isAdmin) {
    redirect("/onboarding");
  }

  return (
    <main className="mx-auto w-full max-w-7xl min-w-0 px-4 py-8 sm:px-6">
      <Tabs
        defaultValue="pending"
        className="!grid grid-cols-1 items-start gap-4 lg:grid-cols-[200px_minmax(0,1fr)]"
      >
        <TabsList className="flex min-w-0 max-w-full flex-row gap-2 self-start overflow-x-auto border-r border-border bg-transparent p-0 pr-3 pt-1 lg:sticky lg:top-24 lg:flex-col lg:overflow-x-visible">
          <TabsTrigger
            value="pending"
            className="flex min-w-[150px] flex-1 items-center justify-center whitespace-normal rounded-lg px-3.5 py-3 text-center text-sm font-medium transition-all text-slate-600 hover:bg-muted/60 hover:text-slate-900 data-active:bg-emerald-500/10 data-active:font-semibold data-active:text-emerald-600 dark:text-slate-300 dark:hover:text-white dark:data-active:bg-emerald-500/20 dark:data-active:text-emerald-400 lg:w-full lg:flex-none lg:min-w-0 lg:justify-start lg:text-left"
          >
            <AlertCircle className="h-4 w-4 mr-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>Pending Verification</span>
          </TabsTrigger>
          <TabsTrigger
            value="doctors"
            className="flex min-w-[140px] flex-1 items-center justify-center whitespace-normal rounded-lg px-3.5 py-3 text-center text-sm font-medium transition-all text-slate-600 hover:bg-muted/60 hover:text-slate-900 data-active:bg-emerald-500/10 data-active:font-semibold data-active:text-emerald-600 dark:text-slate-300 dark:hover:text-white dark:data-active:bg-emerald-500/20 dark:data-active:text-emerald-400 lg:w-full lg:flex-none lg:min-w-0 lg:justify-start lg:text-left"
          >
            <Users className="h-4 w-4 mr-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>Doctors</span>
          </TabsTrigger>
          <TabsTrigger
            value="payouts"
            className="flex min-w-[120px] flex-1 items-center justify-center whitespace-normal rounded-lg px-3.5 py-3 text-center text-sm font-medium transition-all text-slate-600 hover:bg-muted/60 hover:text-slate-900 data-active:bg-emerald-500/10 data-active:font-semibold data-active:text-emerald-600 dark:text-slate-300 dark:hover:text-white dark:data-active:bg-emerald-500/20 dark:data-active:text-emerald-400 lg:w-full lg:flex-none lg:min-w-0 lg:justify-start lg:text-left"
          >
            <CreditCard className="h-4 w-4 mr-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>Payouts</span>
          </TabsTrigger>
          <TabsTrigger
            value="analytics"
            className="flex min-w-[120px] flex-1 items-center justify-center whitespace-normal rounded-lg px-3.5 py-3 text-center text-sm font-medium transition-all text-slate-600 hover:bg-muted/60 hover:text-slate-900 data-active:bg-emerald-500/10 data-active:font-semibold data-active:text-emerald-600 dark:text-slate-300 dark:hover:text-white dark:data-active:bg-emerald-500/20 dark:data-active:text-emerald-400 lg:w-full lg:flex-none lg:min-w-0 lg:justify-start lg:text-left"
          >
            <BarChart3 className="h-4 w-4 mr-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>Analytics</span>
          </TabsTrigger>
        </TabsList>

        <div className="min-w-0 w-full space-y-6">
          <PageHeader title="Admin dashboard" />
          {children}
        </div>
      </Tabs>
    </main>
  );
}
