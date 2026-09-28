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
  const { loading, fn, data } = useFetch(createPrescription);
  const updateMedicine = (index, key, value) => setMedicines((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  const submit = async (event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); formData.append("appointmentId", appointmentId); formData.append("medicines", JSON.stringify(medicines)); await fn(formData); };
  useEffect(() => { if (data?.success) toast.success("Prescription created"); }, [data]);
  if (existing) return <p className="text-sm text-primary">Prescription already created for this consultation.</p>;
  return <form onSubmit={submit} className="space-y-3">
    <label className="grid gap-2 text-sm font-medium">Diagnosis<Textarea name="diagnosis" required maxLength={3000} /></label>
    {medicines.map((medicine, index) => <fieldset key={index} className="grid gap-2 rounded border border-emerald-900/20 p-3 sm:grid-cols-2"><legend className="px-1 text-sm font-medium">Medicine {index + 1}</legend><label className="grid gap-1 text-sm">Medicine name<Input required value={medicine.name} onChange={(e) => updateMedicine(index, "name", e.target.value)} /></label><label className="grid gap-1 text-sm">Dosage<Input required value={medicine.dosage} onChange={(e) => updateMedicine(index, "dosage", e.target.value)} /></label><label className="grid gap-1 text-sm">Frequency<Input required value={medicine.frequency} onChange={(e) => updateMedicine(index, "frequency", e.target.value)} /></label><label className="grid gap-1 text-sm">Duration<Input required value={medicine.duration} onChange={(e) => updateMedicine(index, "duration", e.target.value)} /></label><label className="grid gap-1 text-sm sm:col-span-2">Instructions (optional)<Input value={medicine.instructions} onChange={(e) => updateMedicine(index, "instructions", e.target.value)} /></label></fieldset>)}
    <Button type="button" variant="outline" onClick={() => setMedicines((items) => [...items, { name: "", dosage: "", frequency: "", duration: "", instructions: "" }])}>Add medicine</Button>
    <label className="grid gap-2 text-sm font-medium">General instructions (optional)<Textarea name="generalInstructions" maxLength={3000} /></label>
    {data?.error && <p className="text-sm text-destructive">{data.error}</p>}
    <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90">{loading ? "Saving..." : "Create prescription"}</Button>
  </form>;
}
