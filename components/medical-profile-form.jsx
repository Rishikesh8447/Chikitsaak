"use client";

import { useState } from "react";
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
  if (data?.success) toast.success("Medical profile updated");
  return <form onSubmit={submit} className="space-y-4">
    <Input name="bloodGroup" value={values.bloodGroup || ""} onChange={(e) => change("bloodGroup", e.target.value)} placeholder="Blood group (optional)" maxLength={20} />
    <Textarea name="allergies" value={values.allergies || ""} onChange={(e) => change("allergies", e.target.value)} placeholder="Allergies" maxLength={3000} />
    <Textarea name="existingConditions" value={values.existingConditions || ""} onChange={(e) => change("existingConditions", e.target.value)} placeholder="Existing conditions" maxLength={3000} />
    <Textarea name="currentMedications" value={values.currentMedications || ""} onChange={(e) => change("currentMedications", e.target.value)} placeholder="Current medications" maxLength={3000} />
    {data?.error && <p className="text-sm text-red-400">{data.error}</p>}
    <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">{loading ? "Saving..." : "Save medical profile"}</Button>
  </form>;
}
