"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import useFetch from "@/hooks/use-fetch";
import { createLabTest, setLabTestActive, updateLaboratoryStatus } from "@/actions/laboratory";
import { formatLabUtc } from "@/lib/lab-date-time.mjs";

function useAdminAction(action, message) {
  const router = useRouter();
  const { loading, fn, data, error } = useFetch(action);
  useEffect(() => {
    if (data?.success) {
      toast.success(message);
      router.refresh();
    }
  }, [data, router, message]);
  return { loading, fn, error: error?.message || data?.error };
}

function ActionError({ error }) {
  return error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null;
}

function title(value) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function LaboratoryStatusForm({ laboratory }) {
  const { loading, fn, error } = useAdminAction(updateLaboratoryStatus, "Laboratory status updated");
  const nextStatuses = laboratory.status === "PENDING" ? ["VERIFIED", "REJECTED"] : laboratory.status === "VERIFIED" ? ["SUSPENDED"] : laboratory.status === "SUSPENDED" ? ["VERIFIED"] : [];
  return <form action={fn} className="mt-3 flex flex-wrap items-end gap-2">
    <input type="hidden" name="laboratoryId" value={laboratory.id} />
    <label className="grid gap-1 text-xs">Review reason (required to reject)<Input name="reason" maxLength={1000} defaultValue={laboratory.statusReason || ""} /></label>
    {nextStatuses.map((status) => <Button type="submit" key={status} name="status" value={status} size="sm" variant={status === "REJECTED" || status === "SUSPENDED" ? "outline" : "default"} disabled={loading}>{title(status)}</Button>)}
    {!nextStatuses.length && <span className="text-xs text-muted-foreground">Rejected applications are closed.</span>}
    <ActionError error={error} />
  </form>;
}

function LabTestForm() {
  const { loading, fn, error } = useAdminAction(createLabTest, "Test added to the catalogue");
  return <form action={fn} className="grid gap-3 sm:grid-cols-2">
    <label className="grid gap-1 text-sm">Test name<Input name="name" required maxLength={160} /></label>
    <label className="grid gap-1 text-sm">Code (optional)<Input name="code" maxLength={60} /></label>
    <label className="grid gap-1 text-sm">Category (optional)<Input name="category" maxLength={100} /></label>
    <label className="grid gap-1 text-sm">Description (optional)<Input name="description" maxLength={1000} /></label>
    <ActionError error={error} /><Button type="submit" disabled={loading} className="sm:col-span-2">{loading ? "Saving…" : "Add catalogue test"}</Button>
  </form>;
}

function LabTestRow({ test }) {
  const { loading, fn, error } = useAdminAction(setLabTestActive, test.isActive ? "Test disabled" : "Test enabled");
  return <li className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="font-medium">{test.name}{test.code ? ` · ${test.code}` : ""}</p><p className="text-xs text-muted-foreground">{test.category || "Uncategorized"}{test.description ? ` · ${test.description}` : ""}</p></div><div><form action={fn} className="flex items-center gap-2"><input type="hidden" name="labTestId" value={test.id} /><input type="hidden" name="isActive" value={String(!test.isActive)} /><Badge variant="outline">{test.isActive ? "Active" : "Disabled"}</Badge><Button type="submit" size="sm" variant="outline" disabled={loading}>{test.isActive ? "Disable" : "Enable"}</Button></form><ActionError error={error} /></div></li>;
}

export function LaboratoryPanel({ laboratories, tests, orders, auditEvents }) {
  const applications = laboratories.filter((lab) => lab.status === "PENDING");
  return <div className="space-y-5">
    <Card><CardHeader><CardTitle>Laboratory applications and partners</CardTitle></CardHeader><CardContent className="space-y-3">
      {laboratories.length ? laboratories.map((laboratory) => <article key={laboratory.id} className="rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{laboratory.name}</h3><p className="mt-1 text-xs text-muted-foreground">{laboratory.legalName} · Registration {laboratory.registrationNumber}</p><p className="text-xs text-muted-foreground">{laboratory.city}, {laboratory.state}, {laboratory.country}</p></div><Badge variant="outline">{title(laboratory.status)}</Badge></div>
        <LaboratoryStatusForm laboratory={laboratory} />
      </article>) : <p className="text-sm text-muted-foreground">No laboratory applications yet.</p>}
      {!!applications.length && <p className="text-xs text-muted-foreground">{applications.length} application{applications.length === 1 ? "" : "s"} waiting for review.</p>}
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Shared test catalogue</CardTitle></CardHeader><CardContent className="space-y-4">
      <LabTestForm />
      {tests.length ? <ul className="divide-y divide-border">{tests.map((test) => <LabTestRow key={test.id} test={test} />)}</ul> : <p className="text-sm text-muted-foreground">No catalogue tests yet.</p>}
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Recent laboratory orders</CardTitle></CardHeader><CardContent className="space-y-2">
      {orders.length ? orders.map((order, index) => <article key={`${order.createdAt}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"><div><p className="font-medium">Laboratory order{typeof order._count?.items === "number" ? ` · ${order._count.items} test${order._count.items === 1 ? "" : "s"}` : ""}</p><p className="text-xs text-muted-foreground">{order.laboratory?.name || "Awaiting lab selection"} · {order.source === "DOCTOR" ? "Doctor ordered" : "Patient requested"} · {formatLabUtc(order.createdAt)}</p></div><Badge variant="outline">{title(order.status)}</Badge></article>) : <p className="text-sm text-muted-foreground">No laboratory orders yet.</p>}
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Laboratory audit trail</CardTitle></CardHeader><CardContent className="space-y-2">
      {auditEvents.length ? auditEvents.map((event, index) => <article key={`${event.createdAt}-${index}`} className="rounded-md border border-border p-3"><p className="text-sm font-medium">{event.action.replaceAll("_", " ").toLowerCase()}</p><p className="text-xs text-muted-foreground">{event.laboratory?.name || event.entityType} · {event.laboratory ? "Laboratory partner" : "Platform catalogue"} · {formatLabUtc(event.createdAt)}{event.fromStatus || event.toStatus ? ` · ${event.fromStatus || "new"} → ${event.toStatus || "updated"}` : ""}</p></article>) : <p className="text-sm text-muted-foreground">No laboratory activity recorded yet.</p>}
    </CardContent></Card>
  </div>;
}
