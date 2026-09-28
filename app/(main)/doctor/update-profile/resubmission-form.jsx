"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SPECIALTIES } from "@/lib/specialities";
import { resubmitDoctorProfile } from "@/actions/onboarding";
import useFetch from "@/hooks/use-fetch";

export default function DoctorProfileResubmissionForm({ profile }) {
  const router = useRouter();
  const { register, handleSubmit } = useForm({ defaultValues: { specialty: profile.specialty || "", experience: profile.experience ?? "", credentialUrl: profile.credentialUrl || "", description: profile.description || "", city: profile.city || "", state: profile.state || "", country: profile.country || "" } });
  const { loading, data, fn } = useFetch(resubmitDoctorProfile);
  useEffect(() => { if (data?.success) router.push(data.redirect); }, [data, router]);
  async function submit(values) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) formData.set(key, String(value ?? ""));
    await fn(formData);
  }
  return <Card><CardHeader><CardTitle>Professional information</CardTitle><CardDescription>Correct your professional details and resubmit them for administrator review.</CardDescription></CardHeader><CardContent><form className="space-y-5" onSubmit={handleSubmit(submit)}>
    <div className="space-y-2"><Label htmlFor="specialty">Medical specialty</Label><select id="specialty" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30" {...register("specialty", { required: true })}><option value="">Select specialty</option>{SPECIALTIES.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></div>
    <div className="space-y-2"><Label htmlFor="experience">Years of experience</Label><Input id="experience" type="number" min="0" max="80" {...register("experience", { valueAsNumber: true, required: true })} /></div>
    <div className="space-y-2"><Label htmlFor="credentialUrl">Credential document URL</Label><Input id="credentialUrl" type="url" {...register("credentialUrl", { required: true })} /></div>
    <div className="space-y-2"><Label htmlFor="description">Professional description</Label><Textarea id="description" rows={4} maxLength={5000} {...register("description", { required: true })} /></div>
    <div className="grid gap-4 sm:grid-cols-3">{["city", "state", "country"].map((field) => <div className="space-y-2" key={field}><Label htmlFor={field}>{field[0].toUpperCase() + field.slice(1)}</Label><Input id={field} {...register(field, { required: true })} /></div>)}</div>
    {data?.error && <p role="alert" className="text-sm text-destructive">{data.error}</p>}<Button type="submit" disabled={loading}>{loading ? "Submitting..." : "Resubmit for verification"}</Button>
  </form></CardContent></Card>;
}
