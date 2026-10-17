"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import useFetch from "@/hooks/use-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addPharmacyMember, savePharmacyProduct, setPharmacyProductAvailability, submitPharmacyApplication, updatePharmacyMember, updatePharmacyStatus } from "@/actions/pharmacy";

function useSubmit(action, successMessage) {
  const router = useRouter();
  const { loading, fn, data, error } = useFetch(action);
  useEffect(() => {
    if (data?.success) { toast.success(successMessage); router.refresh(); }
  }, [data, router, successMessage]);
  return { loading, fn, error: error?.message || data?.error };
}

function ErrorText({ error }) { return error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null; }
const labelClass = "grid gap-1.5 text-sm font-medium";

export function PharmacyApplicationForm({ resubmissionOfPharmacyId }) {
  const router = useRouter();
  const { loading, fn, error } = useSubmit(async (formData) => {
    const result = await submitPharmacyApplication(formData);
    if (result.success) router.push(`/pharmacy/workspace?pharmacyId=${result.pharmacyId}`);
    return result;
  }, "Application submitted for review");
  return <form action={fn} className="grid gap-4 sm:grid-cols-2">
    {resubmissionOfPharmacyId && <input type="hidden" name="resubmissionOfPharmacyId" value={resubmissionOfPharmacyId} />}
    <label className={labelClass}>Pharmacy display name<Input name="name" required maxLength={160} /></label>
    <label className={labelClass}>Legal name<Input name="legalName" required maxLength={200} /></label>
    <label className={labelClass}>Pharmacy license number<Input name="licenseNumber" required maxLength={100} /></label>
    <label className={labelClass}>Contact email<Input name="contactEmail" type="email" required maxLength={254} /></label>
    <label className={labelClass}>Contact phone<Input name="contactPhone" required maxLength={40} /></label>
    <label className={`${labelClass} sm:col-span-2`}>Address<Input name="address" required maxLength={500} /></label>
    <label className={labelClass}>City<Input name="city" required maxLength={100} /></label>
    <label className={labelClass}>State or region<Input name="state" required maxLength={100} /></label>
    <label className={`${labelClass} sm:col-span-2`}>Country<Input name="country" required maxLength={100} /></label>
    <ErrorText error={error} /><Button type="submit" disabled={loading} className="sm:col-span-2">{loading ? "Submitting…" : "Submit pharmacy application"}</Button>
  </form>;
}

export function PharmacyProductForm({ pharmacyId, product }) {
  const { loading, fn, error } = useSubmit(savePharmacyProduct, product ? "Product updated" : "Product added");
  return <form action={fn} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
    <input type="hidden" name="pharmacyId" value={pharmacyId} />
    {product && <input type="hidden" name="productId" value={product.id} />}
    <label className={labelClass}>Product name<Input name="name" required maxLength={160} defaultValue={product?.name || ""} /></label>
    <label className={labelClass}>Price<Input name="price" required inputMode="decimal" maxLength={20} defaultValue={product ? Number(product.price).toFixed(2) : ""} /></label>
    <label className={`${labelClass} sm:col-span-2`}>Description (optional)<Textarea name="description" maxLength={1000} defaultValue={product?.description || ""} /></label>
    <ErrorText error={error} /><Button type="submit" disabled={loading} className="sm:col-span-2">{loading ? "Saving…" : product ? "Save product" : "Add catalog product"}</Button>
  </form>;
}

export function PharmacyProductAvailabilityForm({ pharmacyId, product }) {
  const { loading, fn, error } = useSubmit(setPharmacyProductAvailability, "Product availability updated");
  return <form action={fn} className="flex items-center gap-2">
    <input type="hidden" name="pharmacyId" value={pharmacyId} /><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="available" value={String(!product.isAvailable)} />
    <Button type="submit" size="sm" variant="outline" disabled={loading}>{product.isAvailable ? "Mark unavailable" : "Mark available"}</Button><ErrorText error={error} />
  </form>;
}

export function PharmacyMemberForm({ pharmacyId }) {
  const { loading, fn, error } = useSubmit(addPharmacyMember, "Member added to pharmacy");
  return <form action={fn} className="flex flex-wrap items-end gap-2">
    <input type="hidden" name="pharmacyId" value={pharmacyId} />
    <label className={`${labelClass} min-w-52 flex-1`}>Existing account email<Input name="email" type="email" required maxLength={254} /></label>
    <label className={labelClass}>Role<select name="role" className="h-11 rounded-md border border-input bg-card px-3 text-sm"><option value="STAFF">Staff</option><option value="MANAGER">Manager</option></select></label>
    <Button type="submit" disabled={loading}>{loading ? "Adding…" : "Add member"}</Button><ErrorText error={error} />
  </form>;
}

export function PharmacyMemberActions({ pharmacyId, member }) {
  const { loading, fn, error } = useSubmit(updatePharmacyMember, "Member access updated");
  return <form action={fn} className="mt-2 flex flex-wrap items-center gap-2">
    <input type="hidden" name="pharmacyId" value={pharmacyId} /><input type="hidden" name="membershipId" value={member.id} />
    <label className="sr-only" htmlFor={`pharmacy-role-${member.id}`}>Member role</label><select id={`pharmacy-role-${member.id}`} name="role" defaultValue={member.role} className="h-8 rounded-md border border-input bg-card px-2 text-xs"><option value="STAFF">Staff</option><option value="MANAGER">Manager</option></select>
    <Button type="submit" name="action" value="change-role" size="sm" variant="outline" disabled={loading}>Save role</Button><Button type="submit" name="action" value="revoke" size="sm" variant="outline" disabled={loading}>Revoke</Button><ErrorText error={error} />
  </form>;
}

export function PharmacyStatusForm({ pharmacy }) {
  const { loading, fn, error } = useSubmit(updatePharmacyStatus, "Pharmacy status updated");
  const statuses = pharmacy.status === "PENDING" ? ["VERIFIED", "REJECTED"] : pharmacy.status === "VERIFIED" ? ["SUSPENDED"] : pharmacy.status === "SUSPENDED" ? ["VERIFIED"] : [];
  return <form action={fn} className="mt-3 flex flex-wrap items-end gap-2">
    <input type="hidden" name="pharmacyId" value={pharmacy.id} />
    <label className="grid gap-1 text-xs">Review reason (required for rejection or suspension)<Input name="reason" maxLength={1000} defaultValue={pharmacy.statusReason || ""} /></label>
    {statuses.map((status) => <Button type="submit" name="status" value={status} key={status} size="sm" variant={status === "REJECTED" || status === "SUSPENDED" ? "outline" : "default"} disabled={loading}>{status[0] + status.slice(1).toLowerCase()}</Button>)}
    <ErrorText error={error} />
  </form>;
}
