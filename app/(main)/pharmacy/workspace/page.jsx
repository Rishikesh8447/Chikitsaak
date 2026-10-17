import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/actions/onboarding";
import { getPharmacyWorkspace } from "@/actions/pharmacy";
import { PharmacyApplicationForm, PharmacyMemberActions, PharmacyMemberForm, PharmacyProductAvailabilityForm, PharmacyProductForm } from "@/components/pharmacy-forms";

function label(value) { return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export default async function PharmacyWorkspacePage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/onboarding");
  if (user.role === "ADMIN") redirect("/admin");
  const params = await searchParams;
  const workspace = await getPharmacyWorkspace(params?.pharmacyId);
  if (!workspace.selected) return <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-7 sm:px-6 sm:py-9">
    <PageHeader title="Pharmacy partner onboarding" description="Apply to register a pharmacy organization. Partner operations remain locked until Admin approval." backLink="/laboratory" backLabel="Laboratory services" />
    <Card><CardHeader><CardTitle>Pharmacy application</CardTitle></CardHeader><CardContent><PharmacyApplicationForm /></CardContent></Card>
  </main>;

  const { selected, memberships, products, auditEvents, team } = workspace;
  return <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-7 sm:px-6 sm:py-9">
    <PageHeader title={selected.name} description="Manage this pharmacy organization and its product catalog." backLink="/laboratory" backLabel="Healthcare services" />
    {memberships.length > 1 && <nav aria-label="Your pharmacies" className="flex flex-wrap gap-2">{memberships.map((entry) => <Button key={entry.id} variant={entry.pharmacyId === selected.id ? "default" : "outline"} size="sm" render={<Link href={`/pharmacy/workspace?pharmacyId=${entry.pharmacyId}`} />}>{entry.pharmacy.name}</Button>)}</nav>}
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-4"><span className="text-sm font-medium">Partner status</span><Badge variant={selected.status === "VERIFIED" ? "default" : "outline"}>{label(selected.status)}</Badge><span className="text-xs text-muted-foreground">Your organization role: {label(selected.membershipRole)}</span>{selected.statusReason && <p className="w-full text-sm text-muted-foreground">Admin review: {selected.statusReason}</p>}{selected.status !== "VERIFIED" && <p className="w-full text-sm text-muted-foreground">Catalog operations are available only after Admin verification.</p>}</div>
    {selected.status === "REJECTED" && selected.membershipRole === "OWNER" && <Card><CardHeader><CardTitle>Resubmit application</CardTitle></CardHeader><CardContent><PharmacyApplicationForm resubmissionOfPharmacyId={selected.id} /></CardContent></Card>}
    {selected.status === "VERIFIED" && selected.membershipRole === "OWNER" && <Card><CardHeader><CardTitle>Organization members</CardTitle></CardHeader><CardContent className="space-y-4"><ul className="grid gap-2 sm:grid-cols-2">{team.map((member) => <li key={member.id} className="rounded-md border border-border p-3 text-sm"><span className="font-medium">{member.user.name || member.user.email}</span><span className="ml-2 text-xs text-muted-foreground">{label(member.role)}</span>{member.role !== "OWNER" && <PharmacyMemberActions pharmacyId={selected.id} member={member} />}</li>)}</ul><p className="text-xs text-muted-foreground">Members must already have an account. Membership permissions apply only to this pharmacy.</p><PharmacyMemberForm pharmacyId={selected.id} /></CardContent></Card>}
    {selected.status === "VERIFIED" && <Card><CardHeader><CardTitle>Product catalog</CardTitle></CardHeader><CardContent className="space-y-4">
      {selected.membershipRole !== "STAFF" && <PharmacyProductForm pharmacyId={selected.id} />}
      {products.length ? <ul className="divide-y divide-border">{products.map((product) => <li key={product.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><h3 className="font-medium">{product.name}</h3>{product.description && <p className="text-sm text-muted-foreground">{product.description}</p>}<p className="text-xs text-muted-foreground">₹{Number(product.price).toFixed(2)} · {product.isAvailable ? "Available" : "Unavailable"}</p></div>{selected.membershipRole !== "STAFF" && <div className="flex flex-wrap items-center gap-2"><details><summary className="cursor-pointer text-sm text-primary">Edit product</summary><div className="mt-2 w-full min-w-64"><PharmacyProductForm pharmacyId={selected.id} product={product} /></div></details><PharmacyProductAvailabilityForm pharmacyId={selected.id} product={product} /></div>}</li>)}</ul> : <p className="text-sm text-muted-foreground">No products have been added.</p>}
    </CardContent></Card>}
    <Card><CardHeader><CardTitle>Pharmacy audit history</CardTitle></CardHeader><CardContent className="space-y-2">{auditEvents.length ? auditEvents.map((event, index) => <article key={`${event.createdAt}-${index}`} className="rounded-md border border-border p-3"><p className="text-sm font-medium">{label(event.action)}</p><p className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}{event.fromStatus || event.toStatus ? ` · ${event.fromStatus || "new"} → ${event.toStatus || "updated"}` : ""}{event.reason ? ` · ${event.reason}` : ""}</p></article>) : <p className="text-sm text-muted-foreground">No partner activity recorded yet.</p>}</CardContent></Card>
  </main>;
}
