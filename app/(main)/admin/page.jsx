import { TabsContent } from "@/components/ui/tabs";
import { PendingDoctors } from "./_components/pending-doctors";
import { VerifiedDoctors } from "./_components/verified-doctors";
import { PendingPayouts } from "./_components/pending-payouts";
import {
  getPendingDoctors,
  getVerifiedDoctors,
  getPendingPayouts,
} from "@/actions/admin";
import { getAdminAnalytics } from "@/actions/analytics";
import { AnalyticsPanel } from "@/components/analytics-panel";
import Link from "next/link";
import { getAppointmentRefundReviews } from "@/actions/admin";
import { AppointmentRefundReviews } from "./_components/appointment-refund-reviews";

export default async function AdminPage({ searchParams }) {
  const params = await searchParams;
  const range = params?.range || 30;
  // Fetch all data in parallel
  const [pendingDoctorsData, verifiedDoctorsData, pendingPayoutsData, analyticsData, refundReviewsData] =
    await Promise.all([
      getPendingDoctors(),
      getVerifiedDoctors(),
      getPendingPayouts(),
      getAdminAnalytics(range),
      getAppointmentRefundReviews(),
    ]);

  return (
    <>
      <TabsContent value="pending" className="border-none p-0">
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">Laboratory network</p>
          <p className="mt-1 text-sm text-muted-foreground">Review partners, maintain the shared test catalogue, monitor orders, and inspect audit events.</p>
          <Link href="/admin/laboratory" className="mt-2 inline-flex min-h-9 items-center text-sm font-semibold text-primary hover:underline">Open laboratory oversight</Link>
        </div>
        <PendingDoctors doctors={pendingDoctorsData.doctors || []} />
      </TabsContent>

      <TabsContent value="doctors" className="border-none p-0">
        <VerifiedDoctors doctors={verifiedDoctorsData.doctors || []} />
      </TabsContent>

      <TabsContent value="payouts" className="border-none p-0">
        <PendingPayouts payouts={pendingPayoutsData.payouts || []} paymentPayoutIssues={pendingPayoutsData.paymentPayoutIssues || []} />
      </TabsContent>

      <TabsContent value="refunds" className="border-none p-0">
        <AppointmentRefundReviews reviews={refundReviewsData.reviews || []} />
      </TabsContent>

      <TabsContent value="analytics" className="border-none p-0"><AnalyticsPanel title="Admin analytics" analytics={analyticsData} basePath="/admin" admin /></TabsContent>
    </>
  );
}
