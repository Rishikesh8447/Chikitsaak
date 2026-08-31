import { verifyAdmin } from "@/actions/admin";
import { redirect } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, AlertCircle, Users, CreditCard, BarChart3 } from "lucide-react";
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
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 min-w-0">
      <Tabs
        defaultValue="pending"
        className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-6 items-start w-full min-w-0"
      >
        <TabsList className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-x-visible w-full h-auto self-start p-1.5 gap-1.5 bg-card border border-border/80 rounded-xl shadow-xs">
          <TabsTrigger
            value="pending"
            className="flex-1 lg:flex-none flex items-center justify-center lg:justify-start px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-muted/60 data-active:bg-emerald-500/10 data-active:text-emerald-600 dark:data-active:bg-emerald-500/20 dark:data-active:text-emerald-400 data-active:font-semibold w-full"
          >
            <AlertCircle className="h-4 w-4 mr-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>Pending Verification</span>
          </TabsTrigger>
          <TabsTrigger
            value="doctors"
            className="flex-1 lg:flex-none flex items-center justify-center lg:justify-start px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-muted/60 data-active:bg-emerald-500/10 data-active:text-emerald-600 dark:data-active:bg-emerald-500/20 dark:data-active:text-emerald-400 data-active:font-semibold w-full"
          >
            <Users className="h-4 w-4 mr-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>Doctors</span>
          </TabsTrigger>
          <TabsTrigger
            value="payouts"
            className="flex-1 lg:flex-none flex items-center justify-center lg:justify-start px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-muted/60 data-active:bg-emerald-500/10 data-active:text-emerald-600 dark:data-active:bg-emerald-500/20 dark:data-active:text-emerald-400 data-active:font-semibold w-full"
          >
            <CreditCard className="h-4 w-4 mr-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>Payouts</span>
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
          <PageHeader icon={<ShieldCheck />} title="Admin Settings" />
          {children}
        </div>
      </Tabs>
    </div>
  );
}
