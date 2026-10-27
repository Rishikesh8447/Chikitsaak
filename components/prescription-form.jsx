"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPrescription } from "@/actions/medical";
import useFetch from "@/hooks/use-fetch";
import { toast } from "sonner";

export function PrescriptionForm({ appointmentId, existing }) {
  const [medicines, setMedicines] = useState([{ name: "", dosage: "", frequency: "", duration: "", instructions: "" }]);
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpDays, setFollowUpDays] = useState(14);
  const { loading, fn, data } = useFetch(createPrescription);
  const updateMedicine = (index, key, value) => setMedicines((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  const submit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.append("appointmentId", appointmentId);
    formData.append("medicines", JSON.stringify(medicines));
    await fn(formData);
  };
  useEffect(() => { if (data?.success) toast.success("Prescription created"); }, [data]);
  if (existing) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-primary">Prescription already created for this consultation.</p>
        {existing.followUpRequired && existing.followUpDays && (
          <p className="text-xs text-muted-foreground">
            Follow-up consultation recommended within {existing.followUpDays} days (included at ₹0).
          </p>
        )}
      </div>
    );
  }
  return <form onSubmit={submit} className="space-y-3">
    <label className="grid gap-2 text-sm font-medium">Diagnosis<Textarea name="diagnosis" required maxLength={3000} /></label>
    {medicines.map((medicine, index) => <fieldset key={index} className="grid gap-2 rounded border border-emerald-900/20 p-3 sm:grid-cols-2"><legend className="px-1 text-sm font-medium">Medicine {index + 1}</legend><label className="grid gap-1 text-sm">Medicine name<Input required value={medicine.name} onChange={(e) => updateMedicine(index, "name", e.target.value)} /></label><label className="grid gap-1 text-sm">Dosage<Input required value={medicine.dosage} onChange={(e) => updateMedicine(index, "dosage", e.target.value)} /></label><label className="grid gap-1 text-sm">Frequency<Input required value={medicine.frequency} onChange={(e) => updateMedicine(index, "frequency", e.target.value)} /></label><label className="grid gap-1 text-sm">Duration<Input required value={medicine.duration} onChange={(e) => updateMedicine(index, "duration", e.target.value)} /></label><label className="grid gap-1 text-sm sm:col-span-2">Instructions (optional)<Input value={medicine.instructions} onChange={(e) => updateMedicine(index, "instructions", e.target.value)} /></label></fieldset>)}
    <Button type="button" variant="outline" onClick={() => setMedicines((items) => [...items, { name: "", dosage: "", frequency: "", duration: "", instructions: "" }])}>Add medicine</Button>
    <label className="grid gap-2 text-sm font-medium">General instructions (optional)<Textarea name="generalInstructions" maxLength={3000} /></label>

    <div className="rounded-lg border border-border p-3.5 space-y-3 bg-muted/10">
      <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
        <input
          type="checkbox"
          name="followUpRequired"
          checked={followUpRequired}
          onChange={(e) => setFollowUpRequired(e.target.checked)}
          className="size-4 rounded border-border text-primary focus:ring-primary"
        />
        <span>Recommend follow-up consultation (Included at ₹0)</span>
      </label>

      {followUpRequired && (
        <div className="pl-6 space-y-1.5">
          <label htmlFor="followUpDays" className="block text-xs font-medium text-muted-foreground">
            Recommended interval
          </label>
          <select
            id="followUpDays"
            name="followUpDays"
            value={followUpDays}
            onChange={(e) => setFollowUpDays(Number(e.target.value))}
            className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value={3}>Within 3 days (acute review)</option>
            <option value={7}>Within 7 days (1 week)</option>
            <option value={14}>Within 14 days (2 weeks)</option>
            <option value={21}>Within 21 days (3 weeks)</option>
            <option value={30}>Within 30 days (1 month)</option>
            <option value={60}>Within 60 days (2 months)</option>
            <option value={90}>Within 90 days (3 months)</option>
          </select>
          <p className="text-xs text-muted-foreground">
            The patient will be notified and can select any available slot within their entitlement.
          </p>
        </div>
      )}
    </div>

    {data?.error && <p className="text-sm text-destructive">{data.error}</p>}
    <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90">{loading ? "Saving..." : "Create prescription"}</Button>
  </form>;
}
