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

export default async function AdminPage({ searchParams }) {
  const params = await searchParams;
  const range = params?.range || 30;
  // Fetch all data in parallel
  const [pendingDoctorsData, verifiedDoctorsData, pendingPayoutsData, analyticsData] =
    await Promise.all([
      getPendingDoctors(),
      getVerifiedDoctors(),
      getPendingPayouts(),
      getAdminAnalytics(range),
    ]);

  return (
    <>
      <TabsContent value="pending" className="border-none p-0">
        <PendingDoctors doctors={pendingDoctorsData.doctors || []} />
      </TabsContent>

      <TabsContent value="doctors" className="border-none p-0">
        <VerifiedDoctors doctors={verifiedDoctorsData.doctors || []} />
      </TabsContent>

      <TabsContent value="payouts" className="border-none p-0">
        <PendingPayouts payouts={pendingPayoutsData.payouts || []} />
      </TabsContent>

      <TabsContent value="analytics" className="border-none p-0"><AnalyticsPanel title="Admin analytics" analytics={analyticsData} basePath="/admin" /></TabsContent>
    </>
  );
}
