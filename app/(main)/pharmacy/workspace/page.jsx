import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Pill,
  Clock,
  ShieldAlert,
  CheckCircle2,
  Building2,
  Lock,
  MapPin,
  PlusCircle,
  Users,
  Activity,
  FileText,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/actions/onboarding";
import { getPharmacyWorkspace, getPharmacyDispensingRequests } from "@/actions/pharmacy";
import { measureServerTiming } from "@/lib/server-timing.mjs";
import { formatDateOnly, isProductExpired, isProductExpiringSoon, serializePharmacyProduct } from "@/lib/pharmacy-workflow.mjs";
import {
  PharmacyApplicationForm,
  PharmacyMemberActions,
  PharmacyMemberForm,
  PharmacyProductAvailabilityForm,
  PharmacyProductDeleteButton,
  PharmacyProductEditButton,
  PharmacyProductForm,
  PharmacyRequestActionForm,
} from "@/components/pharmacy-forms";

function label(value) {
  if (!value) return "";
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function PharmacyWorkspacePage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/onboarding");
  if (user.role === "ADMIN") redirect("/admin");

  const params = await searchParams;
  const workspace = await measureServerTiming("pharmacyWorkspace.fetch", () =>
    getPharmacyWorkspace(params?.pharmacyId)
  );
  const dispensingResult = workspace.selected?.status === "VERIFIED"
    ? await getPharmacyDispensingRequests(workspace.selected.id)
    : { requests: [] };
  const requests = dispensingResult.requests || [];

  if (!workspace.selected) {
    return (
      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <PageHeader
          identity={{ label: "Pharmacy Workspace", icon: Pill }}
          title="Pharmacy partner registration"
          description="Apply to register a pharmacy organization on Chikitsaak. Partner operations remain locked until administrator approval."
          backLink="/pharmacy"
          backLabel="Pharmacy catalog"
        />
        <Card className="border border-border/80 shadow-xs">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Pharmacy organization application</CardTitle>
            <CardDescription>
              Submit your pharmacy registration, license details, and store address for regulatory review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PharmacyApplicationForm />
          </CardContent>
        </Card>
      </main>
    );
  }

  const { selected, memberships, products: rawProducts, auditEvents, team } = workspace;
  const products = (rawProducts || []).map(serializePharmacyProduct);
  const isVerified = selected.status === "VERIFIED";
  const isPending = selected.status === "PENDING";
  const isRejected = selected.status === "REJECTED";
  const isOwner = selected.membershipRole === "OWNER";

  const availableProductsCount = products.filter((p) => p.isAvailable).length;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-7 sm:px-6 sm:py-9">
      {/* Header with Organization Title and Status */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Pill className="size-3.5 text-primary shrink-0" />
            <span>Pharmacy Workspace</span>
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
              <Badge variant="outline">{label(selected.status)}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-2">
            <span>{selected.city ? `${selected.city}, ${selected.state || selected.country}` : "Pharmacy partner"}</span>
            <span>•</span>
            <span className="font-medium text-foreground/80">{label(selected.membershipRole)}</span>
          </p>
        </div>

        <Button asChild variant="outline" size="sm" className="w-fit self-start">
          <Link href="/pharmacy">
            ← Browse medicine catalog
          </Link>
        </Button>
      </div>

      {/* Multi-Pharmacy Switcher */}
      {memberships.length > 1 && (
        <nav aria-label="Your pharmacies" className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/60 p-2 text-xs">
          <span className="px-2 text-muted-foreground font-medium">Your pharmacies:</span>
          {memberships.map((entry) => (
            <Button
              key={entry.id}
              variant={entry.pharmacyId === selected.id ? "default" : "outline"}
              size="xs"
              asChild
            >
              <Link href={`/pharmacy/workspace?pharmacyId=${entry.pharmacyId}`}>
                {entry.pharmacy.name}
              </Link>
            </Button>
          ))}
        </nav>
      )}

      {/* ========================================================================= */}
      {/* PENDING STATE: Prominent Application Under Review Experience              */}
      {/* ========================================================================= */}
      {isPending && (
        <div className="space-y-6">
          {/* Review Status Banner */}
          <Card className="border border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300">
                <Clock className="h-5 w-5 shrink-0" />
                <CardTitle className="text-lg font-semibold">Pharmacy application is under review</CardTitle>
              </div>
              <CardDescription className="text-amber-900/80 dark:text-amber-200/80 text-sm mt-1">
                Your pharmacy application has been submitted and is currently being verified by the Chikitsaak administration team.
                Catalog operations, product publishing, and staff management will unlock once your state drug license and facility details are approved.
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
                    License and store details recorded.
                  </p>
                </div>

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <Clock className="h-4 w-4 shrink-0 animate-pulse" />
                    <span>2. License Verification</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Administrator reviewing pharmacy credentials.
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-background/50 p-3 opacity-70">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>3. Catalogue Live</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Partner catalog management unlocks automatically.
                  </p>
                </div>
              </div>

              {selected.statusReason && (
                <div className="mt-4 rounded-md border border-amber-500/30 bg-background p-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Admin review note: </span>
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
                Submitted pharmacy details
              </CardTitle>
              <CardDescription>
                Details registered for this pharmacy organization. These are validated against state pharmacy licensing records.
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
                  <dt className="text-xs font-medium text-muted-foreground">Drug License Number</dt>
                  <dd className="mt-1 font-mono font-medium text-foreground">{selected.licenseNumber || "—"}</dd>
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
                  <dt className="text-xs font-medium text-muted-foreground">Store Location</dt>
                  <dd className="mt-1 font-medium text-foreground">
                    {selected.city ? `${selected.city}, ${selected.state || ""} ${selected.country || ""}` : selected.address || "—"}
                  </dd>
                </div>
              </dl>

              {selected.address && (
                <div className="mt-3 rounded-md border border-border/60 bg-muted/10 p-3 text-xs text-muted-foreground flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-foreground">Registered address: </strong>
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
                    <Pill className="h-3.5 w-3.5 text-muted-foreground" />
                    Product Catalogue
                  </p>
                  <p>Catalog operations are available only after Admin verification.</p>
                </div>
                <div className="rounded-md border border-border/70 p-3">
                  <p className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    Pricing & Inventory
                  </p>
                  <p>Product pricing updates and stock availability toggles are locked pending license verification.</p>
                </div>
                <div className="rounded-md border border-border/70 p-3">
                  <p className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    Staff Access
                  </p>
                  <p>Inviting staff pharmacists and assigning management roles unlocks once verified.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REJECTED STATE: Application review feedback and owner resubmission        */}
      {/* ========================================================================= */}
      {isRejected && (
        <div className="space-y-6">
          <Card className="border border-rose-500/30 bg-rose-50/40 dark:bg-rose-950/20 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5 text-rose-800 dark:text-rose-300">
                <ShieldAlert className="h-5 w-5 shrink-0" />
                <CardTitle className="text-lg font-semibold">Pharmacy application was not approved</CardTitle>
              </div>
              <CardDescription className="text-rose-900/80 dark:text-rose-200/80 text-sm mt-1">
                {selected.statusReason ? (
                  <>
                    <strong className="font-semibold text-foreground">Admin review: </strong>
                    {selected.statusReason}
                  </>
                ) : (
                  "The application could not be verified with the provided license or store details. Please review your credentials and resubmit."
                )}
              </CardDescription>
            </CardHeader>
          </Card>

          {selected.status === "REJECTED" && selected.membershipRole === "OWNER" && (
            <Card className="border border-border/80 shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg">Resubmit application</CardTitle>
                <CardDescription>
                  Update your pharmacy license and store details for a new compliance review.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <PharmacyApplicationForm resubmissionOfPharmacyId={selected.id} />
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
                <span className="text-xs font-semibold uppercase tracking-wider">Product Catalogue</span>
                <Pill className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{products.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {availableProductsCount} listed as available
              </p>
            </section>

            <section className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Recent Activity</span>
                <Activity className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{auditEvents.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Recorded organization events
              </p>
            </section>

            <section className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Operation Model</span>
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 text-lg font-bold text-foreground">
                Reference Catalog
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Direct dispensing &amp; patient discovery
              </p>
            </section>

            <section className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Your Role</span>
                <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="mt-2 text-xl font-bold text-foreground truncate">
                {label(selected.membershipRole)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isOwner ? "Organization owner" : "Staff access"}
              </p>
            </section>
          </div>

          {/* Organization Members Section (for verified owners) */}
          {selected.status === "VERIFIED" && selected.membershipRole === "OWNER" && (
            <Card id="organization" className="border border-border/80 shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Organization members
                    </CardTitle>
                    <CardDescription>
                      Manage authorized team members, managers, and staff for {selected.name}.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {team.length} {team.length === 1 ? "member" : "members"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="grid gap-3 sm:grid-cols-2">
                  {team.map((member) => (
                    <li key={member.id} className="rounded-lg border border-border/80 bg-muted/15 p-3.5 text-sm flex flex-col justify-between">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-foreground">{member.user.name || member.user.email}</p>
                          {member.user.name && (
                            <p className="text-xs text-muted-foreground mt-0.5">{member.user.email}</p>
                          )}
                        </div>
                        <Badge variant={member.role === "OWNER" ? "default" : "outline"} className="text-xs">
                          {label(member.role)}
                        </Badge>
                      </div>
                      {member.role !== "OWNER" && (
                        <div className="mt-3 pt-2 border-t border-border/50">
                          <PharmacyMemberActions pharmacyId={selected.id} member={member} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                  <h4 className="text-sm font-semibold text-foreground mb-1">Add a new organization member</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Members must already have an account. Membership permissions apply only to this pharmacy.
                  </p>
                  <PharmacyMemberForm pharmacyId={selected.id} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Product Catalog Section */}
          {selected.status === "VERIFIED" && (
            <Card id="catalog" className="border border-border/80 shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Pill className="h-5 w-5 text-primary" />
                      Product catalog
                    </CardTitle>
                    <CardDescription>
                      Manage medications, healthcare supplies, and reference pricing published by this pharmacy.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {products.length} {products.length === 1 ? "product" : "products"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Add Product Form */}
                {selected.membershipRole !== "STAFF" && (
                  <details className="group rounded-lg border border-border/80 bg-muted/10 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-foreground flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <PlusCircle className="h-4 w-4 text-primary" />
                        Add a new medication or product to catalog
                      </span>
                      <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="mt-4">
                      <PharmacyProductForm pharmacyId={selected.id} />
                    </div>
                  </details>
                )}

                {/* Products List */}
                {products.length ? (
                  <ul className="divide-y divide-border rounded-lg border border-border/70 overflow-hidden">
                    {products.map((product) => {
                      const expired = product.expiryDate ? isProductExpired(product.expiryDate) : false;
                      const expiringSoon = product.expiryDate ? isProductExpiringSoon(product.expiryDate) : false;
                      const mfgStr = product.manufactureDate ? formatDateOnly(product.manufactureDate) : null;
                      const expStr = product.expiryDate ? formatDateOnly(product.expiryDate) : null;

                      return (
                      <li key={product.id} className={`flex flex-wrap items-center justify-between gap-4 p-4 transition-colors ${expired ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-muted/15"}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-foreground text-sm">{product.name}</h3>
                            {expired && (
                              <Badge variant="destructive" className="text-[10px]">Expired</Badge>
                            )}
                            {!expired && expiringSoon && (
                              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px]">
                                Expiring soon
                              </Badge>
                            )}
                          </div>
                          {product.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{product.description}</p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">₹{Number(product.price).toFixed(2)}</span>
                            <span>·</span>
                            <span className={expired ? "text-destructive font-medium" : product.isAvailable ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground"}>
                              {expired ? "Expired (unavailable)" : product.isAvailable ? "Available in store" : "Temporarily unavailable"}
                            </span>
                            {(mfgStr || expStr) && (
                              <>
                                <span>·</span>
                                {mfgStr && <span>Mfg: {mfgStr}</span>}
                                {mfgStr && expStr && <span>·</span>}
                                {expStr && (
                                  <span className={expired ? "text-destructive font-medium" : expiringSoon ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>
                                    Exp: {expStr}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {selected.membershipRole !== "STAFF" && (
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <PharmacyProductEditButton pharmacyId={selected.id} product={product} />
                            <PharmacyProductAvailabilityForm pharmacyId={selected.id} product={product} />
                            <PharmacyProductDeleteButton pharmacyId={selected.id} product={product} />
                          </div>
                        )}
                      </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="text-center py-8 border border-dashed border-border rounded-lg">
                    <Pill className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
                    <p className="text-sm font-medium text-foreground">No products added yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Use the form above to add your first medicine or health product.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Requests & Orders Section */}
          <Card id="requests" className="border border-border/80 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Requests and orders
                  </CardTitle>
                  <CardDescription>
                    Patient dispensing requests awaiting store confirmation or fulfillment.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {requests.length} {requests.length === 1 ? "request" : "requests"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {requests.length ? (
                <ul className="divide-y divide-border rounded-lg border border-border/70 overflow-hidden">
                  {requests.map((req) => {
                    const statusBadgeVariant =
                      req.status === "AWAITING_STORE_CONFIRMATION" ? "outline" :
                      req.status === "CONFIRMED" ? "secondary" :
                      req.status === "READY_FOR_PICKUP" ? "default" :
                      req.status === "COMPLETED" ? "outline" : "destructive";

                    const statusClass =
                      req.status === "AWAITING_STORE_CONFIRMATION" ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400" :
                      req.status === "CONFIRMED" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" :
                      req.status === "READY_FOR_PICKUP" ? "bg-emerald-600 text-white" :
                      req.status === "COMPLETED" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400" :
                      "bg-destructive/10 text-destructive";

                    const totalCost = req.items?.reduce((sum, it) => sum + Number(it.price) * it.quantity, 0) || 0;

                    return (
                      <li key={req.id} className="p-4 space-y-3 hover:bg-muted/10 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground text-sm">
                              {req.patientName}
                            </span>
                            {req.patientEmail && (
                              <span className="text-xs text-muted-foreground">({req.patientEmail})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={statusBadgeVariant} className={`text-[10px] font-medium ${statusClass}`}>
                              {label(req.status)}
                            </Badge>
                            <time className="text-[11px] text-muted-foreground">
                              {new Date(req.createdAt).toLocaleDateString()}
                            </time>
                          </div>
                        </div>

                        {/* Items requested */}
                        <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 text-xs space-y-1.5">
                          <div className="font-medium text-foreground text-[11px] uppercase tracking-wider text-muted-foreground">
                            Requested Items ({req.items?.length || 0}):
                          </div>
                          {req.items?.map((it, idx) => (
                            <div key={idx} className="flex items-center justify-between text-muted-foreground">
                              <span className="font-medium text-foreground">{it.name} × {it.quantity}</span>
                              <span>₹{(Number(it.price) * it.quantity).toFixed(2)}</span>
                            </div>
                          ))}
                          <div className="pt-1 border-t border-border/50 flex justify-between font-semibold text-foreground">
                            <span>Estimated Total:</span>
                            <span className="text-primary">₹{totalCost.toFixed(2)}</span>
                          </div>
                        </div>

                        {req.patientNote && (
                          <div className="text-xs bg-muted/40 p-2 rounded border border-border/50">
                            <span className="font-medium text-foreground">Patient note: </span>
                            <span className="text-muted-foreground italic">&quot;{req.patientNote}&quot;</span>
                          </div>
                        )}

                        {/* Action buttons for pharmacy staff */}
                        <PharmacyRequestActionForm pharmacyId={selected.id} request={req} />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="text-center py-8 border border-dashed border-border rounded-lg">
                  <FileText className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">No dispensing requests yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Patient dispensing requests submitted for your pharmacy catalog medicines will appear here for store confirmation.
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-border/70 bg-muted/20 p-4 text-xs text-muted-foreground space-y-1 mt-3">
                <p className="font-semibold text-foreground">Reference &amp; direct dispensing operational model</p>
                <p>
                  Chikitsaak operates as an accredited reference catalog for verified pharmacies. Published medicines and healthcare products are indexed for clinician guidance and patient discovery. Prescription dispensing and transactions are fulfilled directly by your pharmacy through in-store pickup or local delivery.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Pharmacy Audit History Section */}
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Pharmacy audit history
                </CardTitle>
                <span className="text-xs text-muted-foreground font-mono">{auditEvents.length} events</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {auditEvents.length ? (
                auditEvents.map((event, index) => (
                  <article key={`${event.createdAt}-${index}`} className="rounded-md border border-border/60 bg-muted/15 p-3 text-xs">
                    <p className="font-semibold text-foreground">{label(event.action)}</p>
                    <p className="text-muted-foreground mt-0.5">
                      {new Date(event.createdAt).toLocaleString()}
                      {event.fromStatus || event.toStatus ? ` · ${event.fromStatus || "new"} → ${event.toStatus || "updated"}` : ""}
                      {event.reason ? ` · Reason: ${event.reason}` : ""}
                    </p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No partner activity recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
