import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { formatLabUtc } from "@/lib/lab-date-time.mjs";
import { LaboratoryApplicationForm, LaboratoryMemberActions, LaboratoryMemberForm, LaboratoryOfferingForm, LaboratoryOrderTransitionForm, LaboratoryResultForm, OfferingAvailabilityForm } from "@/components/laboratory-forms";
import { getCurrentUser } from "@/actions/onboarding";
import { getLaboratoryWorkspace } from "@/actions/laboratory";

function titleStatus(value) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function LaboratoryWorkspacePage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/onboarding");
  if (user.role === "ADMIN") redirect("/admin");
  const params = await searchParams;
  const workspace = await getLaboratoryWorkspace(params?.laboratoryId);
  if (!workspace.selected) return <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-7 sm:px-6 sm:py-9">
    <PageHeader title="Laboratory workspace" description="Apply to join the Chikitsaak laboratory network." backLink="/laboratory" backLabel="Laboratory tests" />
    <Card><CardHeader><CardTitle>Laboratory application</CardTitle></CardHeader><CardContent><LaboratoryApplicationForm /></CardContent></Card>
  </main>;

  const { selected, memberships, offerings, orders, tests, team } = workspace;
  return <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-7 sm:px-6 sm:py-9">
    <PageHeader title={selected.name} description="Manage test availability and laboratory requests." backLink="/laboratory" backLabel="Patient laboratory page" />
    {memberships.length > 1 && <nav aria-label="Your laboratories" className="flex flex-wrap gap-2">{memberships.map((membership) => <Button key={membership.id} variant={membership.laboratoryId === selected.id ? "default" : "outline"} size="sm" render={<Link href={`/laboratory/workspace?laboratoryId=${membership.laboratoryId}`} />}>{membership.laboratory.name}</Button>)}</nav>}
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-4"><span className="text-sm font-medium">Partner status</span><Badge variant={selected.status === "VERIFIED" ? "default" : "outline"}>{titleStatus(selected.status)}</Badge>{selected.status === "REJECTED" && selected.statusReason && <p className="w-full text-sm text-muted-foreground"><span className="font-medium text-foreground">Admin review feedback: </span>{selected.statusReason}</p>}{selected.status === "REJECTED" && selected.membershipRole === "OWNER" && !selected.statusReason && <p className="w-full text-sm text-muted-foreground">No review feedback is recorded for this application. Contact support before resubmitting.</p>}{selected.status !== "REJECTED" && selected.statusReason && <p className="w-full text-sm text-muted-foreground">{selected.statusReason}</p>}{selected.status !== "VERIFIED" && <p className="w-full text-sm text-muted-foreground">Only verified laboratories can publish bookable offerings or manage test orders.</p>}</div>

    {selected.status === "REJECTED" && selected.membershipRole === "OWNER" && <Card><CardHeader><CardTitle>Resubmit laboratory application</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Submit updated laboratory details for a new review. Your previous application and its review history remain recorded.</p><LaboratoryApplicationForm resubmissionOfLaboratoryId={selected.id} /></CardContent></Card>}

    {selected.membershipRole === "OWNER" && <Card><CardHeader><CardTitle>Organization members</CardTitle></CardHeader><CardContent className="space-y-4">
      <ul className="grid gap-2 sm:grid-cols-2">{team.map((member) => <li key={member.id} className="rounded-md border border-border p-3 text-sm"><span className="font-medium">{member.user.name || member.user.email}</span><span className="ml-2 text-xs text-muted-foreground">{titleStatus(member.role)}</span>{member.user.name && <p className="mt-1 text-xs text-muted-foreground">{member.user.email}</p>}{member.role !== "OWNER" && <LaboratoryMemberActions laboratoryId={selected.id} member={member} />}</li>)}</ul>
      <p className="text-xs text-muted-foreground">Members must already have a Chikitsaak account. Roles are scoped to this laboratory.</p>
      <LaboratoryMemberForm laboratoryId={selected.id} />
    </CardContent></Card>}

    {selected.status === "VERIFIED" && <Card><CardHeader><CardTitle>Test offerings</CardTitle></CardHeader><CardContent className="space-y-4">
      {selected.membershipRole !== "STAFF" && <LaboratoryOfferingForm laboratoryId={selected.id} tests={tests} />}
      {offerings.length ? <ul className="divide-y divide-border">{offerings.map((offering) => <li key={offering.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><h3 className="font-medium">{offering.labTest.name}</h3><p className="text-xs text-muted-foreground">{Number(offering.price).toFixed(2)}{offering.estimatedHours ? ` · ${offering.estimatedHours} hour turnaround` : ""}{offering.preparationInstructions ? ` · ${offering.preparationInstructions}` : ""}</p></div>{selected.membershipRole !== "STAFF" && <OfferingAvailabilityForm laboratoryId={selected.id} offeringId={offering.id} available={offering.isAvailable} />}<Badge variant="outline">{offering.isAvailable ? "Available" : "Unavailable"}</Badge></li>)}</ul> : <p className="text-sm text-muted-foreground">No test offerings have been added yet.</p>}
    </CardContent></Card>}

    <Card><CardHeader><CardTitle>Assigned laboratory orders</CardTitle></CardHeader><CardContent className="space-y-3">
      {orders.length ? orders.map((order) => <article key={order.id} className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">{order.items.map((item) => item.testName).join(", ")}</h3><p className="mt-1 text-xs text-muted-foreground">{order.patient.name || "Patient"}{order.doctor?.name ? ` · Ordered by Dr. ${order.doctor.name}` : ""} · {formatLabUtc(order.createdAt)}</p></div><Badge variant="outline">{titleStatus(order.status)}</Badge></div>{order.items.map((item) => item.testDescription && <p key={item.id} className="mt-1 text-xs text-muted-foreground">{item.testCategory ? `${item.testCategory} · ` : ""}{item.testDescription}</p>)}
        {order.collectionAt && <p className="mt-2 text-sm">Collection: {formatLabUtc(order.collectionAt)}{order.collectionNotes ? ` · ${order.collectionNotes}` : ""}</p>}
        {order.clinicalInstructions && <p className="mt-2 rounded-md bg-muted/50 p-3 text-sm"><span className="font-medium">Doctor instructions: </span>{order.clinicalInstructions}</p>}
        {selected.status === "VERIFIED" && <LaboratoryOrderTransitionForm laboratoryId={selected.id} orderId={order.id} status={order.status} />}
        {order.status === "COLLECTED" && selected.status === "VERIFIED" && !order.statusHistory.some((entry) => entry.note?.startsWith("Laboratory result: ")) && <LaboratoryResultForm laboratoryId={selected.id} orderId={order.id} />}
        <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Status history</summary><ol className="mt-2 space-y-1">{order.statusHistory.map((entry, index) => <li key={`${entry.toStatus}-${index}`}>{formatLabUtc(entry.createdAt)} · {titleStatus(entry.toStatus)}{entry.note ? ` · ${entry.note}` : ""}</li>)}</ol></details>
      </article>) : <p className="text-sm text-muted-foreground">No orders have been assigned to this laboratory.</p>}
    </CardContent></Card>
  </main>;
}
