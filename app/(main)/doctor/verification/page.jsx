import { ClipboardCheck, AlertCircle, XCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getCurrentUser } from "@/actions/onboarding";
import { redirect } from "next/navigation";

export default async function VerificationPage() {
  // Get complete user profile
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") redirect("/onboarding");

  // If already verified, redirect to dashboard
  if (user?.verificationStatus === "VERIFIED") {
    redirect("/doctor");
  }

  const isRejected = user?.verificationStatus === "REJECTED";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div>
        <Card className="border-border shadow-xs">
          <CardHeader className="text-center">
            <div
              className={`mx-auto mb-4 flex size-12 items-center justify-center rounded-xl ${isRejected ? "bg-destructive/10" : "bg-amber-500/10"}`}
            >
              {isRejected ? (
                <XCircle className="size-6 text-destructive" />
              ) : (
                <ClipboardCheck className="size-6 text-amber-700 dark:text-amber-400" />
              )}
            </div>
            <CardTitle className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {isRejected
                ? "Verification Declined"
                : "Verification in Progress"}
            </CardTitle>
            <CardDescription className="text-lg">
              {isRejected
                ? "Unfortunately, your application needs revision"
                : "Thank you for submitting your information"}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            {isRejected ? (
              <div className="mb-6 flex items-start rounded-md border border-destructive/20 bg-destructive/5 p-4">
                <AlertCircle className="mr-3 mt-0.5 size-5 shrink-0 text-destructive" />
                <div className="text-muted-foreground text-left">
                  <p className="mb-2">
                    Our administrative team has reviewed your application and
                    found that it doesn&apos;t meet our current requirements.
                    Common reasons for rejection include:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 mb-3">
                    <li>Insufficient or unclear credential documentation</li>
                    <li>Professional experience requirements not met</li>
                    <li>Incomplete or vague service description</li>
                  </ul>
                  <p>
                    You can update your application with more information and
                    resubmit for review.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mb-6 flex items-start rounded-md border border-amber-500/20 bg-amber-500/5 p-4">
                <AlertCircle className="mr-3 mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" />
                <p className="text-muted-foreground text-left">
                  Your profile is currently under review by our administrative
                  team. This process typically takes 1-2 business days.
                  You&apos;ll receive an email notification once your account is
                  verified.
                </p>
              </div>
            )}

            <p className="text-muted-foreground mb-6">
              {isRejected
                ? "You can update your doctor profile and resubmit for verification."
                : "While you wait, you can familiarize yourself with our platform or reach out to our support team if you have any questions."}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isRejected ? (
                <>
                  <Button
                    asChild
                    variant="outline"
                    className=""
                  >
                    <Link href="/">Return to Home</Link>
                  </Button>
                  <Button
                    asChild
                    className=""
                  >
                    <Link href="/doctor/update-profile">Update Profile</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    asChild
                    variant="outline"
                    className=""
                  >
                    <Link href="/">Return to Home</Link>
                  </Button>
                  <Button
                    asChild
                    className=""
                  >
                    <Link href="/contact-support">Contact Support</Link>
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
