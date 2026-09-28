import { verifyAdmin } from "@/actions/admin";
import { redirect } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Users, CreditCard, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Administration | Chikitsaak",
  description: "Review doctor applications and manage platform operations.",
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
        className="!grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(12rem,14rem)_minmax(0,1fr)] lg:gap-6"
      >
        <TabsList aria-label="Administration" className="grid h-auto w-full min-w-0 max-w-full grid-cols-2 gap-1 self-start rounded-lg border border-border bg-card p-1 shadow-xs lg:sticky lg:top-32 xl:top-24 lg:flex lg:flex-col lg:items-stretch lg:h-auto">
          <TabsTrigger
            value="pending"
            className="flex min-h-10 min-w-0 items-center justify-start gap-2 whitespace-nowrap rounded-md border border-transparent px-2 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-active:border-primary/20 data-active:bg-primary/10 data-active:font-semibold data-active:text-primary sm:px-3 sm:text-sm lg:w-full lg:h-auto lg:flex-none"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span>Pending Verification</span>
          </TabsTrigger>
          <TabsTrigger
            value="doctors"
            className="flex min-h-10 min-w-0 items-center justify-start gap-2 whitespace-nowrap rounded-md border border-transparent px-2 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-active:border-primary/20 data-active:bg-primary/10 data-active:font-semibold data-active:text-primary sm:px-3 sm:text-sm lg:w-full lg:h-auto lg:flex-none"
          >
            <Users className="size-4 shrink-0" />
            <span>Doctors</span>
          </TabsTrigger>
          <TabsTrigger
            value="payouts"
            className="flex min-h-10 min-w-0 items-center justify-start gap-2 whitespace-nowrap rounded-md border border-transparent px-2 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-active:border-primary/20 data-active:bg-primary/10 data-active:font-semibold data-active:text-primary sm:px-3 sm:text-sm lg:w-full lg:h-auto lg:flex-none"
          >
            <CreditCard className="size-4 shrink-0" />
            <span>Payouts</span>
          </TabsTrigger>
          <TabsTrigger
            value="analytics"
            className="flex min-h-10 min-w-0 items-center justify-start gap-2 whitespace-nowrap rounded-md border border-transparent px-2 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-active:border-primary/20 data-active:bg-primary/10 data-active:font-semibold data-active:text-primary sm:px-3 sm:text-sm lg:w-full lg:h-auto lg:flex-none"
          >
            <BarChart3 className="size-4 shrink-0" />
            <span>Analytics</span>
          </TabsTrigger>
        </TabsList>

        <div className="min-w-0 w-full space-y-6">
          <PageHeader title="Administration" description="Review doctor applications, manage payouts, and monitor platform activity." backLink={null} />
          {children}
        </div>
      </Tabs>
    </main>
  );
}
