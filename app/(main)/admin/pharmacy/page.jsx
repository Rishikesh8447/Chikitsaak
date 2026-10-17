import { redirect } from "next/navigation";
import { verifyAdmin } from "@/actions/admin";
import { getAdminPharmacyOverview } from "@/actions/pharmacy";
import { PharmacyStatusForm } from "@/components/pharmacy-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

function label(value) { return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export default async function AdminPharmacyPage() {
  if (!(await verifyAdmin())) redirect("/onboarding");
  const { pharmacies, auditEvents } = await getAdminPharmacyOverview();
  return <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-7 sm:px-6 sm:py-9">
    <PageHeader title="Pharmacy oversight" description="Review pharmacy partner applications and inspect status history." backLink="/admin" backLabel="Administration" />
    <Card><CardHeader><CardTitle>Pharmacy applications and partners</CardTitle></CardHeader><CardContent className="space-y-3">{pharmacies.length ? pharmacies.map((pharmacy) => <article key={pharmacy.id} className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{pharmacy.name}</h2><p className="text-sm text-muted-foreground">{pharmacy.legalName} · License {pharmacy.licenseNumber}</p><p className="text-xs text-muted-foreground">{pharmacy.contactEmail} · {pharmacy.contactPhone}</p><p className="text-xs text-muted-foreground">{pharmacy.address}, {pharmacy.city}, {pharmacy.state}, {pharmacy.country}</p><p className="text-xs text-muted-foreground">Submitted {new Date(pharmacy.createdAt).toLocaleString()}</p></div><Badge variant="outline">{label(pharmacy.status)}</Badge></div><PharmacyStatusForm pharmacy={pharmacy} /></article>) : <p className="text-sm text-muted-foreground">No pharmacy applications yet.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Pharmacy review audit trail</CardTitle></CardHeader><CardContent className="space-y-2">{auditEvents.length ? auditEvents.map((event, index) => <article key={`${event.createdAt}-${index}`} className="rounded-md border border-border p-3"><p className="text-sm font-medium">{event.pharmacy?.name || "Pharmacy"} · {label(event.action)}</p><p className="text-xs text-muted-foreground">By {event.actor?.name || event.actor?.email || "Former administrator"} · {new Date(event.createdAt).toLocaleString()}{event.fromStatus || event.toStatus ? ` · ${event.fromStatus || "new"} → ${event.toStatus || "updated"}` : ""}{event.reason ? ` · ${event.reason}` : ""}</p></article>) : <p className="text-sm text-muted-foreground">No pharmacy decisions recorded.</p>}</CardContent></Card>
  </main>;
}
