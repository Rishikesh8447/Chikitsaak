import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/actions/onboarding";
import { redirect } from "next/navigation";

export default async function ContactSupportPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") redirect("/onboarding");
  if (user.verificationStatus === "VERIFIED") redirect("/doctor");
  if (user.verificationStatus === "REJECTED") redirect("/doctor/update-profile");
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
    <PageHeader title="Verification support" description="Guidance for doctors waiting on an application review." backLink="/doctor/verification" backLabel="Verification status" />
    <Card><CardHeader><CardTitle>Your application is under review</CardTitle><CardDescription>Verification is handled by the Chikitsaak administrator team.</CardDescription></CardHeader><CardContent className="space-y-4 text-sm leading-6 text-muted-foreground"><p>While your application is pending, check that your profile includes a working credential document link and complete professional and location details.</p><p>If your application is declined, the verification page will provide a link to update and resubmit your profile.</p><p>Support messaging is not configured in this application yet. You can return here to review these steps while the administrator review is pending.</p><Button asChild variant="outline"><Link href="/doctor/verification">Return to verification status</Link></Button></CardContent></Card>
  </main>;
}
