import Link from "next/link";
import { redirect } from "next/navigation";
import {
  FlaskConical,
  Clock,
  ShieldAlert,
  CheckCircle2,
  Building2,
  Lock,
  MapPin,
  FileText,
  UserCheck,
  PlusCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { formatLabUtc } from "@/lib/lab-date-time.mjs";
import {
  LaboratoryApplicationForm,
  LaboratoryMemberActions,
  LaboratoryMemberForm,
  LaboratoryOfferingForm,
  LaboratoryOrderTransitionForm,
  LaboratoryResultForm,
  OfferingAvailabilityForm,
} from "@/components/laboratory-forms";
import { getCurrentUser } from "@/actions/onboarding";
import { getLaboratoryWorkspace } from "@/actions/laboratory";
import { measureServerTiming } from "@/lib/server-timing.mjs";

function titleStatus(value) {
  if (!value) return "";
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function LaboratoryWorkspacePage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/onboarding");
  if (user.role === "ADMIN") redirect("/admin");

  const params = await searchParams;
  const workspace = await measureServerTiming("laboratoryWorkspace.fetch", () =>
    getLaboratoryWorkspace(params?.laboratoryId)
  );

  if (!workspace.selected) {
    return (
      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <PageHeader
          identity={{ label: "Laboratory Workspace", icon: FlaskConical }}
          title="Laboratory partner registration"
          description="Apply to register a clinical laboratory organization on Chikitsaak."
          backLink="/laboratory"
          backLabel="Laboratory directory"
        />
        <Card className="border border-border/80 shadow-xs">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Laboratory organization application</CardTitle>
            <CardDescription>
              Submit your clinical laboratory details, registration number, and facility address for administrator review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LaboratoryApplicationForm />
          </CardContent>
        </Card>
      </main>
    );
  }

  const { selected, memberships, offerings, orders, tests, team } = workspace;
  const isVerified = selected.status === "VERIFIED";
  const isPending = selected.status === "PENDING";
  const isRejected = selected.status === "REJECTED";
  const isOwner = selected.membershipRole === "OWNER";

  const availableOfferingsCount = offerings.filter((o) => o.isAvailable).length;
  const activeOrdersCount = orders.filter((o) => ["REQUESTED", "ACCEPTED", "COLLECTION_SCHEDULED", "COLLECTED"].includes(o.status)).length;
  const pendingCollectionCount = orders.filter((o) => ["REQUESTED", "ACCEPTED", "COLLECTION_SCHEDULED"].includes(o.status)).length;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-7 sm:px-6 sm:py-9">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <FlaskConical className="size-3.5 text-primary shrink-0" />
            <span>Laboratory Workspace</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl font-heading">
              {selected.name}
            </h1>
            {isVerified && (
              <Badge variant="outline" className="border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Verified partner
              </Badge>
            )}
            {isPending && (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">
                <Clock className="mr-1 h-3.5 w-3.5" />
                Awaiting verification
              </Badge>
            )}
            {isRejected && (
              <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400 font-medium">
                <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                Application declined
              </Badge>
            )}
            {!isVerified && !isPending && !isRejected && (
              <Badge variant="outline">{titleStatus(selected.status)}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-2">
            <span>{selected.city ? `${selected.city}, ${selected.state || selected.country}` : "Laboratory organization"}</span>
            <span>•</span>
            <span className="font-medium text-foreground/80">{titleStatus(selected.membershipRole)}</span>
          </p>
        </div>

        <Button asChild variant="outline" size="sm" className="w-fit self-start">
          <Link href="/laboratory">
            ← Patient laboratory page
          </Link>
        </Button>
      </div>

      {/* Laboratory Switcher for multi-facility members */}
      {memberships.length > 1 && (
        <nav aria-label="Your laboratories" className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/60 p-2 text-xs">
          <span className="px-2 text-muted-foreground font-medium">Laboratories:</span>
          {memberships.map((membership) => (
            <Button
              key={membership.id}
              variant={membership.laboratoryId === selected.id ? "default" : "outline"}
              size="xs"
              asChild
            >
              <Link href={`/laboratory/workspace?laboratoryId=${membership.laboratoryId}`}>
                {membership.laboratory.name}
              </Link>
            </Button>
          ))}
        </nav>
      )}

      {/* ========================================================================= */}
      {/* PENDING STATE: Prominent, minimal Application Under Review Experience     */}
      {/* ========================================================================= */}
      {isPending && (
        <div className="space-y-6">
          {/* Review Status Banner */}
          <Card className="border border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300">
                <Clock className="h-5 w-5 shrink-0" />
                <CardTitle className="text-lg font-semibold">Laboratory application is under review</CardTitle>
              </div>
              <CardDescription className="text-amber-900/80 dark:text-amber-200/80 text-sm mt-1">
                Your laboratory application has been received and is currently being verified by the Chikitsaak administrator team.
                While your application is pending review, operational features like publishing bookable test offerings and processing test orders are locked.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Progress Milestones */}
              <div className="grid gap-3 pt-2 sm:grid-cols-3">
                <div className="rounded-lg border border-amber-500/20 bg-background/80 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>1. Application Submitted</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Details and accreditation record received.
                  </p>
                </div>

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <Clock className="h-4 w-4 shrink-0 animate-pulse" />
                    <span>2. Compliance Review</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Verifying facility registration & license.
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-background/50 p-3 opacity-70">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>3. Network Activation</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Catalog & order operations activate automatically.
                  </p>
                </div>
              </div>

              {selected.statusReason && (
                <div className="mt-4 rounded-md border border-amber-500/30 bg-background p-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Review note: </span>
                  {selected.statusReason}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submitted Profile & Application Info */}
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Submitted laboratory details
              </CardTitle>
              <CardDescription>
                Information provided during laboratory registration. This data is verified against state medical and diagnostic registers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                  <dt className="text-xs font-medium text-muted-foreground">Display Name</dt>
                  <dd className="mt-1 font-semibold text-foreground">{selected.name}</dd>
                </div>
                <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                  <dt className="text-xs font-medium text-muted-foreground">Legal Entity Name</dt>
                  <dd className="mt-1 font-semibold text-foreground">{selected.legalName || "—"}</dd>
                </div>
                <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                  <dt className="text-xs font-medium text-muted-foreground">Registration / License</dt>
                  <dd className="mt-1 font-mono font-medium text-foreground">{selected.registrationNumber || "—"}</dd>
                </div>
                <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                  <dt className="text-xs font-medium text-muted-foreground">Contact Email</dt>
                  <dd className="mt-1 font-medium text-foreground truncate">{selected.contactEmail || "—"}</dd>
                </div>
                <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                  <dt className="text-xs font-medium text-muted-foreground">Contact Phone</dt>
                  <dd className="mt-1 font-medium text-foreground">{selected.contactPhone || "—"}</dd>
                </div>
                <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                  <dt className="text-xs font-medium text-muted-foreground">Facility Location</dt>
                  <dd className="mt-1 font-medium text-foreground">
                    {selected.city ? `${selected.city}, ${selected.state || ""} ${selected.country || ""}` : selected.address || "—"}
                  </dd>
                </div>
              </dl>

              {selected.address && (
                <div className="mt-3 rounded-md border border-border/60 bg-muted/10 p-3 text-xs text-muted-foreground flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-foreground">Full facility address: </strong>
                    {selected.address}, {selected.city}, {selected.state}, {selected.country}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Locked Operations Notice */}
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Operations unavailable while pending verification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3 text-xs text-muted-foreground">
                <div className="rounded-md border border-border/70 p-3">
                  <p className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                    <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                    Test Offerings & Pricing
                  </p>
                  <p>Only verified laboratories can publish bookable offerings or manage test orders.</p>
                </div>
                <div className="rounded-md border border-border/70 p-3">
                  <p className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    Assigned Test Orders
                  </p>
                  <p>Doctors and patients cannot route diagnostic test requests to this facility before approval.</p>
                </div>
                <div className="rounded-md border border-border/70 p-3">
                  <p className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    Organization Management
                  </p>
                  <p>Inviting staff and assigning laboratory management roles unlocks once verified.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REJECTED STATE: Clear review feedback & owner resubmission form          */}
      {/* ========================================================================= */}
      {isRejected && (
        <div className="space-y-6">
          <Card className="border border-rose-500/30 bg-rose-50/40 dark:bg-rose-950/20 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5 text-rose-800 dark:text-rose-300">
                <ShieldAlert className="h-5 w-5 shrink-0" />
                <CardTitle className="text-lg font-semibold">Laboratory application was not approved</CardTitle>
              </div>
              <div className="text-rose-900/80 dark:text-rose-200/80 text-sm mt-1 space-y-1">
                {selected.status === "REJECTED" && selected.statusReason && (
                  <p className="w-full text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Admin review feedback: </span>
                    {selected.statusReason}
                  </p>
                )}
                {selected.status === "REJECTED" && selected.membershipRole === "OWNER" && !selected.statusReason && (
                  <p className="w-full text-sm text-muted-foreground">
                    No review feedback is recorded for this application. Contact support before resubmitting.
                  </p>
                )}
              </div>
            </CardHeader>
          </Card>

          {selected.status === "REJECTED" && selected.membershipRole === "OWNER" && (
            <Card className="border border-border/80 shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg">Resubmit laboratory application</CardTitle>
                <CardDescription>
                  Submit updated laboratory details for a new review. Your previous application and its review history remain recorded.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <LaboratoryApplicationForm resubmissionOfLaboratoryId={selected.id} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VERIFIED OPERATIONAL WORKSPACE: Redesigned Minimal Professional Dashboard */}
      {/* ========================================================================= */}
      {isVerified && (
        <div className="space-y-6">
          {/* Summary Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <section className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Test Offerings</span>
                <FlaskConical className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{offerings.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {availableOfferingsCount} currently available
              </p>
            </section>

            <section className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Assigned Orders</span>
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{orders.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeOrdersCount} active in workflow
              </p>
            </section>

            <section className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Pending Collections</span>
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{pendingCollectionCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Samples awaiting pickup / intake
              </p>
            </section>

            <section className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Organization Role</span>
                <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="mt-2 text-xl font-bold text-foreground truncate">
                {titleStatus(selected.membershipRole)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isOwner ? "Full administrative authority" : "Operational staff access"}
              </p>
            </section>
          </div>

          {/* Organization Members Section (for verified owners) */}
          {selected.status === "VERIFIED" && selected.membershipRole === "OWNER" && <Card>
              <CardHeader>
                <CardTitle>Organization members</CardTitle>
                <CardDescription>
                  Manage authorized members, roles, and staff permissions for {selected.name}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="grid gap-2 sm:grid-cols-2">
                  {team.map((member) => (
                    <li key={member.id} className="rounded-md border border-border p-3 text-sm">
                      <span className="font-medium">{member.user.name || member.user.email}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{titleStatus(member.role)}</span>
                      {member.user.name && <p className="mt-1 text-xs text-muted-foreground">{member.user.email}</p>}
                      {member.role !== "OWNER" && <LaboratoryMemberActions laboratoryId={selected.id} member={member} />}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Members must already have a Chikitsaak account. Roles are scoped to this laboratory.
                </p>
                <LaboratoryMemberForm laboratoryId={selected.id} />
              </CardContent>
            </Card>}

          {/* Test Offerings Section */}
          {selected.status === "VERIFIED" && (
            <Card id="offerings" className="border border-border/80 shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FlaskConical className="h-5 w-5 text-primary" />
                      Test offerings
                    </CardTitle>
                    <CardDescription>
                      Configure diagnostic tests, prices, and turnaround times available at this facility.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {offerings.length} {offerings.length === 1 ? "test" : "tests"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {selected.membershipRole !== "STAFF" && (
                  <details className="group rounded-lg border border-border/80 bg-muted/10 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-foreground flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <PlusCircle className="h-4 w-4 text-primary" />
                        Add a test offering from diagnostic catalog
                      </span>
                      <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="mt-4">
                      <LaboratoryOfferingForm laboratoryId={selected.id} tests={tests} />
                    </div>
                  </details>
                )}

                {offerings.length ? (
                  <ul className="divide-y divide-border">
                    {offerings.map((offering) => (
                      <li key={offering.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div>
                          <h3 className="font-medium text-foreground">{offering.labTest.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            ₹{Number(offering.price).toFixed(2)}
                            {offering.estimatedHours ? ` · ${offering.estimatedHours} hour turnaround` : ""}
                            {offering.preparationInstructions ? ` · ${offering.preparationInstructions}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {selected.membershipRole !== "STAFF" && (
                            <OfferingAvailabilityForm
                              laboratoryId={selected.id}
                              offeringId={offering.id}
                              available={offering.isAvailable}
                            />
                          )}
                          <Badge variant="outline">{offering.isAvailable ? "Available" : "Unavailable"}</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No test offerings have been added yet.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Assigned Laboratory Orders Section */}
          <Card id="orders" className="border border-border/80 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Assigned laboratory orders
                  </CardTitle>
                  <CardDescription>
                    Process patient orders, schedule sample collections, and upload laboratory results.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {orders.length} {orders.length === 1 ? "order" : "orders"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {orders.length ? (
                orders.map((order) => (
                  <article key={order.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">{order.items.map((item) => item.testName).join(", ")}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {order.patient.name || "Patient"}
                          {order.doctor?.name ? ` · Ordered by Dr. ${order.doctor.name}` : ""} · {formatLabUtc(order.createdAt)}
                        </p>
                      </div>
                      <Badge variant="outline">{titleStatus(order.status)}</Badge>
                    </div>

                    {order.items.map(
                      (item) =>
                        item.testDescription && (
                          <p key={item.id} className="mt-1 text-xs text-muted-foreground">
                            {item.testCategory ? `${item.testCategory} · ` : ""}
                            {item.testDescription}
                          </p>
                        )
                    )}

                    {order.collectionAt && (
                      <p className="mt-2 text-sm">
                        Collection: {formatLabUtc(order.collectionAt)}
                        {order.collectionNotes ? ` · ${order.collectionNotes}` : ""}
                      </p>
                    )}

                    {order.clinicalInstructions && (
                      <p className="mt-2 rounded-md bg-muted/50 p-3 text-sm">
                        <span className="font-medium">Doctor instructions: </span>
                        {order.clinicalInstructions}
                      </p>
                    )}

                    {selected.status === "VERIFIED" && (
                      <LaboratoryOrderTransitionForm
                        laboratoryId={selected.id}
                        orderId={order.id}
                        status={order.status}
                      />
                    )}

                    {order.status === "COLLECTED" && selected.status === "VERIFIED" && !order.statusHistory.some((entry) => entry.note?.startsWith("Laboratory result: ")) && <LaboratoryResultForm laboratoryId={selected.id} orderId={order.id} />}

                    <details className="mt-3 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Status history</summary>
                      <ol className="mt-2 space-y-1">
                        {order.statusHistory.map((entry, index) => (
                          <li key={`${entry.toStatus}-${index}`}>
                            {formatLabUtc(entry.createdAt)} · {titleStatus(entry.toStatus)}
                            {entry.note ? ` · ${entry.note}` : ""}
                          </li>
                        ))}
                      </ol>
                    </details>
                  </article>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No orders have been assigned to this laboratory.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
