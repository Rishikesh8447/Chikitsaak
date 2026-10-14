"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import useFetch from "@/hooks/use-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addLaboratoryMember,
  bookDoctorLabOrder,
  createDoctorLabOrder,
  createPatientLabOrder,
  saveLaboratoryOffering,
  setLaboratoryOfferingAvailability,
  submitLaboratoryApplication,
  transitionLabOrder,
  submitLaboratoryResult,
  updateLaboratoryMember,
  retryRejectedLabOrder,
} from "@/actions/laboratory";

function useLabSubmit(action, successMessage, onSuccess) {
  const router = useRouter();
  const { loading, fn, data, error } = useFetch(action);
  useEffect(() => {
    if (data?.success) {
      toast.success(successMessage);
      if (onSuccess) onSuccess(data);
      else router.refresh();
    }
  }, [data, onSuccess, router, successMessage]);
  return { loading, fn, error: error?.message || data?.error };
}

const inputClass = "grid gap-1.5 text-sm font-medium text-foreground";

function ActionError({ error }) {
  return error ? <p role="alert" className="sm:col-span-2 text-sm text-destructive">{error}</p> : null;
}

export function LaboratoryApplicationForm({ resubmissionOfLaboratoryId }) {
  const router = useRouter();
  const onSuccess = useCallback(({ laboratoryId }) => router.push(`/laboratory/workspace?laboratoryId=${laboratoryId}`), [router]);
  const { loading, fn, error } = useLabSubmit(submitLaboratoryApplication, "Application submitted for review", onSuccess);
  return <form action={fn} className="grid gap-4 sm:grid-cols-2">
    {resubmissionOfLaboratoryId && <input type="hidden" name="resubmissionOfLaboratoryId" value={resubmissionOfLaboratoryId} />}
    <label className={inputClass}>Laboratory display name<Input name="name" required maxLength={160} /></label>
    <label className={inputClass}>Legal name<Input name="legalName" required maxLength={200} /></label>
    <label className={inputClass}>Registration number<Input name="registrationNumber" required maxLength={100} /></label>
    <label className={inputClass}>Contact email<Input name="contactEmail" type="email" required maxLength={254} /></label>
    <label className={inputClass}>Contact phone<Input name="contactPhone" required maxLength={40} /></label>
    <label className={`${inputClass} sm:col-span-2`}>Address<Input name="address" required maxLength={500} /></label>
    <label className={inputClass}>City<Input name="city" required maxLength={100} /></label>
    <label className={inputClass}>State or region<Input name="state" required maxLength={100} /></label>
    <label className={`${inputClass} sm:col-span-2`}>Country<Input name="country" required maxLength={100} /></label>
    <ActionError error={error} /><Button type="submit" disabled={loading} className="sm:col-span-2">{loading ? "Submitting…" : "Submit laboratory application"}</Button>
  </form>;
}

export function DoctorLabOrderForm({ appointments, tests }) {
  const { loading, fn, error } = useLabSubmit(createDoctorLabOrder, "Test order sent to the patient");
  return <form action={fn} className="space-y-4">
    <label className={inputClass}>Patient appointment
      <select name="appointmentId" required defaultValue="" className="h-11 rounded-md border border-input bg-card px-3 text-sm">
        <option value="" disabled>Select an active or completed appointment</option>
        {appointments.map((appointment) => <option key={appointment.id} value={appointment.id}>{appointment.patient.name || "Patient"} · {new Date(appointment.startTime).toLocaleDateString()} · {appointment.status.replaceAll("_", " ")}</option>)}
      </select>
    </label>
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">Tests to order</legend>
      {tests.map((test) => <label key={test.id} className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm"><input type="checkbox" name="labTestIds" value={test.id} />{test.name}{test.category && <span className="ml-auto text-xs text-muted-foreground">{test.category}</span>}</label>)}
      {!tests.length && <p className="text-sm text-muted-foreground">No active tests are offered by verified laboratories yet.</p>}
    </fieldset>
    <label className={inputClass}>Clinical instructions (optional)<Textarea name="clinicalInstructions" maxLength={3000} /></label>
    <ActionError error={error} /><Button type="submit" disabled={loading || !tests.length}>{loading ? "Submitting…" : "Create test order"}</Button>
  </form>;
}

export function PatientBookingForm({ laboratories }) {
  const [laboratoryId, setLaboratoryId] = useState(laboratories[0]?.id || "");
  const { loading, fn, error } = useLabSubmit(createPatientLabOrder, "Laboratory booking request submitted");
  const selected = laboratories.find((lab) => lab.id === laboratoryId);
  return <form action={fn} className="space-y-4">
    <label className={inputClass}>Laboratory
      <select name="laboratoryId" required value={laboratoryId} onChange={(event) => setLaboratoryId(event.target.value)} className="h-11 rounded-md border border-input bg-card px-3 text-sm">
        {laboratories.map((lab) => <option key={lab.id} value={lab.id}>{lab.name} · {lab.city}, {lab.state}</option>)}
      </select>
    </label>
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">Available tests</legend>
      {(selected?.offerings || []).map((offering) => <label key={offering.id} className="grid min-h-11 grid-cols-[auto_1fr_auto] items-start gap-2 rounded-md border border-border px-3 py-2 text-sm"><input type="checkbox" name="offeringIds" value={offering.id} className="mt-1" /><span><span className="font-medium">{offering.labTest.name}</span>{offering.labTest.category && <span className="ml-2 text-xs text-muted-foreground">{offering.labTest.category}</span>}{offering.labTest.description && <span className="block text-xs text-muted-foreground">{offering.labTest.description}</span>}{offering.preparationInstructions && <span className="mt-1 block text-xs">Preparation: {offering.preparationInstructions}</span>}{offering.estimatedHours && <span className="block text-xs text-muted-foreground">Estimated turnaround: {offering.estimatedHours} hours</span>}</span><span className="text-muted-foreground">{Number(offering.price).toFixed(2)}</span></label>)}
      {!selected?.offerings?.length && <p className="text-sm text-muted-foreground">No available offerings at this laboratory.</p>}
    </fieldset>
    <label className={inputClass}>Clinical instructions (optional)<Textarea name="clinicalInstructions" maxLength={3000} /></label>
    <ActionError error={error} /><Button type="submit" disabled={loading || !selected?.offerings?.length}>{loading ? "Booking…" : "Request selected tests"}</Button>
  </form>;
}

export function PatientChooseLabForm({ orderId, laboratories }) {
  const { loading, fn, error } = useLabSubmit(bookDoctorLabOrder, "Laboratory selected; the lab has been notified");
  const [laboratoryId, setLaboratoryId] = useState("");
  const selected = laboratories.find((lab) => lab.id === laboratoryId);
  return <form action={fn} className="flex flex-wrap items-end gap-2">
    <input type="hidden" name="labOrderId" value={orderId} />
    <label className={`${inputClass} min-w-52 flex-1`}>Choose a laboratory
      <select name="laboratoryId" required value={laboratoryId} onChange={(event) => setLaboratoryId(event.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm">
        <option value="" disabled>Select an eligible laboratory</option>
        {laboratories.map((lab) => <option key={lab.id} value={lab.id}>{lab.name}</option>)}
      </select>
    </label>
    {selected && <div className="w-full rounded-md border border-border p-3 text-sm"><p className="font-medium">Review services and prices at {selected.name}</p>{selected.offerings.map((offering) => <p key={offering.labTestId} className="mt-2"><span className="font-medium">{offering.labTest.name}</span>{offering.labTest.category && ` · ${offering.labTest.category}`} · {Number(offering.price).toFixed(2)}{offering.estimatedHours ? ` · ${offering.estimatedHours} hour turnaround` : ""}{offering.preparationInstructions ? ` · Preparation: ${offering.preparationInstructions}` : ""}{offering.labTest.description ? <span className="block text-xs text-muted-foreground">{offering.labTest.description}</span> : null}</p>)}</div>}
    <ActionError error={error} /><Button type="submit" size="sm" disabled={loading || !selected}>{loading ? "Saving…" : "Confirm laboratory"}</Button>
  </form>;
}

export function PatientRetryLabOrderForm({ orderId }) {
  const { loading, fn, error } = useLabSubmit(retryRejectedLabOrder, "Choose another laboratory to continue");
  return <form action={fn}><input type="hidden" name="labOrderId" value={orderId} /><ActionError error={error} /><Button type="submit" size="sm" variant="outline" disabled={loading}>{loading ? "Reopening…" : "Choose another laboratory"}</Button></form>;
}

export function LaboratoryOfferingForm({ laboratoryId, tests }) {
  const { loading, fn, error } = useLabSubmit(saveLaboratoryOffering, "Test offering saved");
  return <form action={fn} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
    <input type="hidden" name="laboratoryId" value={laboratoryId} />
    <label className={inputClass}>Test
      <select name="labTestId" required defaultValue="" className="h-11 rounded-md border border-input bg-card px-3 text-sm"><option value="" disabled>Select a catalog test</option>{tests.map((test) => <option key={test.id} value={test.id}>{test.name}</option>)}</select>
    </label>
    <label className={inputClass}>Price<Input name="price" inputMode="decimal" placeholder="0.00" required maxLength={11} /></label>
    <label className={inputClass}>Estimated hours (optional)<Input name="estimatedHours" type="number" min="1" max="8760" /></label>
    <label className={`${inputClass} sm:col-span-2`}>Preparation instructions (optional)<Textarea name="preparationInstructions" maxLength={3000} /></label>
    <ActionError error={error} /><Button type="submit" disabled={loading || !tests.length} className="sm:col-span-2">{loading ? "Saving…" : "Save offering"}</Button>
  </form>;
}

export function LaboratoryMemberForm({ laboratoryId }) {
  const { loading, fn, error } = useLabSubmit(addLaboratoryMember, "Member added");
  return <form action={fn} className="flex flex-wrap items-end gap-2">
    <input type="hidden" name="laboratoryId" value={laboratoryId} />
    <label className={`${inputClass} min-w-52 flex-1`}>Existing account email<Input name="email" type="email" required maxLength={254} /></label>
    <label className={inputClass}>Role<select name="role" className="h-11 rounded-md border border-input bg-card px-3 text-sm"><option value="STAFF">Staff</option><option value="MANAGER">Manager</option></select></label>
    <ActionError error={error} /><Button type="submit" disabled={loading}>{loading ? "Adding…" : "Add member"}</Button>
  </form>;
}

export function LaboratoryMemberActions({ laboratoryId, member }) {
  const { loading, fn, error } = useLabSubmit(updateLaboratoryMember, "Member access updated");
  return <form action={fn} className="mt-2 flex flex-wrap items-center gap-2">
    <input type="hidden" name="laboratoryId" value={laboratoryId} /><input type="hidden" name="membershipId" value={member.id} />
    <select name="role" defaultValue={member.role} aria-label={`Role for ${member.user.name || member.user.email}`} className="h-8 rounded-md border border-input bg-card px-2 text-xs"><option value="STAFF">Staff</option><option value="MANAGER">Manager</option></select>
    <Button type="submit" name="action" value="change-role" size="sm" variant="outline" disabled={loading}>Save role</Button>
    <Button type="submit" name="action" value="revoke" size="sm" variant="outline" disabled={loading}>Revoke</Button><ActionError error={error} />
  </form>;
}

export function OfferingAvailabilityForm({ laboratoryId, offeringId, available }) {
  const { loading, fn, error } = useLabSubmit(setLaboratoryOfferingAvailability, available ? "Offering disabled" : "Offering enabled");
  return <form action={fn} className="inline-flex gap-1">
    <input type="hidden" name="laboratoryId" value={laboratoryId} /><input type="hidden" name="offeringId" value={offeringId} /><input type="hidden" name="available" value={String(!available)} />
    <Button type="submit" size="sm" variant="outline" disabled={loading}>{available ? "Disable" : "Enable"}</Button><ActionError error={error} />
  </form>;
}

export function LaboratoryOrderTransitionForm({ laboratoryId, orderId, status }) {
  const { loading, fn, error } = useLabSubmit(transitionLabOrder, "Laboratory order updated");
  const submit = async (formData) => {
    const localCollectionTime = formData.get("collectionAt");
    if (typeof localCollectionTime === "string" && localCollectionTime) {
      const utcTime = new Date(localCollectionTime);
      if (!Number.isNaN(utcTime.getTime())) formData.set("collectionAt", utcTime.toISOString());
    }
    await fn(formData);
  };
  return <form action={submit} className="mt-3 flex flex-wrap items-end gap-2">
    <input type="hidden" name="laboratoryId" value={laboratoryId} /><input type="hidden" name="labOrderId" value={orderId} />
    {status === "REQUESTED" && <>
      <label className="grid gap-1 text-xs">Reason for rejection (required to reject)<Input name="collectionNotes" maxLength={1000} /></label>
      <Button type="submit" name="action" value="accept" size="sm" disabled={loading}>Accept</Button>
      <Button type="submit" name="action" value="reject" size="sm" variant="outline" disabled={loading}>Reject</Button>
    </>}
    {status === "ACCEPTED" && <>
      <label className="grid gap-1 text-xs">Collection time (your local time; stored in UTC)<Input name="collectionAt" type="datetime-local" required /></label>
      <label className="grid gap-1 text-xs">Collection notes<Input name="collectionNotes" maxLength={1000} /></label>
      <Button type="submit" name="action" value="schedule" size="sm" disabled={loading}>Schedule collection</Button>
    </>}
    {status === "COLLECTION_SCHEDULED" && <Button type="submit" name="action" value="collect" size="sm" disabled={loading}>Mark sample collected</Button>}
    <ActionError error={error} />
  </form>;
}

export function LaboratoryResultForm({ laboratoryId, orderId }) {
  const { loading, fn, error } = useLabSubmit(submitLaboratoryResult, "Test result submitted to the patient");
  return <form action={fn} className="mt-3 grid gap-2 rounded-md border border-border p-3">
    <input type="hidden" name="laboratoryId" value={laboratoryId} />
    <input type="hidden" name="labOrderId" value={orderId} />
    <label className={inputClass}>Test result<Textarea name="result" required maxLength={10_000} rows={5} placeholder="Enter the laboratory result and relevant interpretation." /></label>
    <ActionError error={error} />
    <Button type="submit" size="sm" disabled={loading}>{loading ? "Submitting…" : "Submit result"}</Button>
  </form>;
}
