"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateMedicalProfile } from "@/actions/medical";
import useFetch from "@/hooks/use-fetch";
import { toast } from "sonner";

export function MedicalProfileForm({ profile }) {
  const [values, setValues] = useState(profile || {});
  const { loading, fn, data } = useFetch(updateMedicalProfile);
  const change = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await fn(formData);
  };
  useEffect(() => { if (data?.success) toast.success("Medical profile updated"); }, [data]);
  return <form onSubmit={submit} className="space-y-4">
    <label className="grid gap-2 text-sm font-medium">Blood group (optional)<Input name="bloodGroup" value={values.bloodGroup || ""} onChange={(e) => change("bloodGroup", e.target.value)} maxLength={20} /></label>
    <label className="grid gap-2 text-sm font-medium">Allergies<Textarea name="allergies" value={values.allergies || ""} onChange={(e) => change("allergies", e.target.value)} maxLength={3000} /></label>
    <label className="grid gap-2 text-sm font-medium">Existing conditions<Textarea name="existingConditions" value={values.existingConditions || ""} onChange={(e) => change("existingConditions", e.target.value)} maxLength={3000} /></label>
    <label className="grid gap-2 text-sm font-medium">Current medications<Textarea name="currentMedications" value={values.currentMedications || ""} onChange={(e) => change("currentMedications", e.target.value)} maxLength={3000} /></label>
    {data?.error && <p className="text-sm text-destructive">{data.error}</p>}
    <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90">{loading ? "Saving..." : "Save medical profile"}</Button>
  </form>;
}
