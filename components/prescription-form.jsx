"use client";

import { useState } from "react";
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
  if (data?.success) toast.success("Prescription created");
  if (existing) return <p className="text-sm text-emerald-400">Prescription already created for this consultation.</p>;
  return <form onSubmit={submit} className="space-y-3">
    <Textarea name="diagnosis" required placeholder="Diagnosis" maxLength={3000} />
    {medicines.map((medicine, index) => <div key={index} className="grid gap-2 rounded border border-emerald-900/20 p-3 sm:grid-cols-2"><Input required placeholder="Medicine name" value={medicine.name} onChange={(e) => updateMedicine(index, "name", e.target.value)} /><Input required placeholder="Dosage" value={medicine.dosage} onChange={(e) => updateMedicine(index, "dosage", e.target.value)} /><Input required placeholder="Frequency" value={medicine.frequency} onChange={(e) => updateMedicine(index, "frequency", e.target.value)} /><Input required placeholder="Duration" value={medicine.duration} onChange={(e) => updateMedicine(index, "duration", e.target.value)} /><Input className="sm:col-span-2" placeholder="Instructions (optional)" value={medicine.instructions} onChange={(e) => updateMedicine(index, "instructions", e.target.value)} /></div>)}
    <Button type="button" variant="outline" onClick={() => setMedicines((items) => [...items, { name: "", dosage: "", frequency: "", duration: "", instructions: "" }])}>Add medicine</Button>
    <Textarea name="generalInstructions" placeholder="General instructions (optional)" maxLength={3000} />
    {data?.error && <p className="text-sm text-red-400">{data.error}</p>}
    <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">{loading ? "Saving..." : "Create prescription"}</Button>
  </form>;
}
