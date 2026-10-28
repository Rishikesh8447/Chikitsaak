"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import useFetch from "@/hooks/use-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addPharmacyMember, deletePharmacyProduct, savePharmacyProduct, setPharmacyProductAvailability, submitPharmacyApplication, updatePharmacyMember, updatePharmacyStatus, updatePharmacyDispensingRequestStatus, cancelPatientDispensingRequest } from "@/actions/pharmacy";
import { formatDateOnly, isProductExpired } from "@/lib/pharmacy-workflow.mjs";
import { DatePicker } from "@/components/ui/date-picker";

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

export function PharmacyProductForm({ pharmacyId, product, onSuccess, onCancel }) {
  const { loading, fn, error } = useSubmit(savePharmacyProduct, product ? "Product updated" : "Product added", () => {
    if (onSuccess) onSuccess();
  });
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState("");
  const mfgDefault = product?.manufactureDate ? formatDateOnly(product.manufactureDate) : "";
  const expDefault = product?.expiryDate ? formatDateOnly(product.expiryDate) : "";
  const [mfgDate, setMfgDate] = useState(mfgDefault);
  const [expDate, setExpDate] = useState(expDefault);
  const [isAvailable, setIsAvailable] = useState(product ? String(product.isAvailable) : "true");

  const isLocked = loading || submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLocked) return;
    const form = e.currentTarget;
    const name = form.elements.name?.value?.trim();
    if (!name) {
      setClientError("Product name is required");
      return;
    }
    const price = form.elements.price?.value?.trim();
    if (!price || !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(price)) {
      setClientError("Enter a valid non-negative price with up to 2 decimal places");
      return;
    }
    const mfg = form.elements.manufactureDate?.value || mfgDate;
    const exp = form.elements.expiryDate?.value || expDate;
    if (mfg && exp && exp < mfg) {
      setClientError("Expiry date cannot be before manufacturing date");
      return;
    }
    const availVal = form.elements.isAvailable?.value || isAvailable;
    if (availVal === "true" && exp && isProductExpired(exp)) {
      setClientError("Expired products cannot be made available for dispensing");
      return;
    }
    setClientError("");
    setSubmitting(true);
    try {
      const formData = new FormData(form);
      const res = await fn(formData);
      if (res?.success && onSuccess) {
        onSuccess();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
    <input type="hidden" name="pharmacyId" value={pharmacyId} />
    {product && <input type="hidden" name="productId" value={product.id} />}
    <label className={labelClass}>Product or medicine name<Input name="name" required maxLength={160} defaultValue={product?.name || ""} placeholder="e.g. Paracetamol 500mg" /></label>
    <label className={labelClass}>Price (₹)<Input name="price" required inputMode="decimal" maxLength={20} defaultValue={product ? Number(product.price).toFixed(2) : ""} placeholder="0.00" /></label>
    <label className={labelClass}>
      <span>Availability</span>
      <select
        name="isAvailable"
        value={isAvailable}
        onChange={(e) => { setIsAvailable(e.target.value); setClientError(""); }}
        className="h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="true">Available for dispensing</option>
        <option value="false">Unavailable / Out of stock</option>
      </select>
    </label>
    <div className={labelClass}>
      <span>Manufacturing date (optional)</span>
      <DatePicker
        name="manufactureDate"
        defaultValue={mfgDefault}
        value={mfgDate}
        onChange={(val) => { setMfgDate(val); setClientError(""); }}
        maxDate={expDate || undefined}
        placeholder="Pick manufacturing date"
      />
    </div>
    <div className={`${labelClass} sm:col-span-2`}>
      <span>Expiry date (optional)</span>
      <DatePicker
        name="expiryDate"
        defaultValue={expDefault}
        value={expDate}
        onChange={(val) => { setExpDate(val); setClientError(""); }}
        minDate={mfgDate || undefined}
        placeholder="Pick expiry date"
      />
    </div>
    <label className={`${labelClass} sm:col-span-2`}>Description (optional)<Textarea name="description" maxLength={1000} defaultValue={product?.description || ""} placeholder="Dosage, active ingredients, or packaging details..." /></label>
    <div className="sm:col-span-2">
      <ErrorText error={clientError || error} />
    </div>
    <div className="flex items-center justify-end gap-2 sm:col-span-2 pt-1">
      {onCancel && (
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isLocked}>
          Cancel
        </Button>
      )}
      <Button type="submit" disabled={isLocked} className={onCancel ? "" : "w-full"}>
        {isLocked ? "Saving…" : product ? "Save product" : "Add catalog product"}
      </Button>
    </div>
  </form>;
}

export function PharmacyProductEditButton({ pharmacyId, product }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-xs text-primary hover:bg-primary/10 h-8 px-2.5 font-medium"
        onClick={() => setOpen(true)}
      >
        Edit details
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Edit Product Details</h3>
                <p className="text-xs text-muted-foreground">Update medicine pricing, stock availability, or shelf dates</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              >
                ✕
              </Button>
            </div>
            <PharmacyProductForm
              pharmacyId={pharmacyId}
              product={product}
              onSuccess={() => setOpen(false)}
              onCancel={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

export function PharmacyProductDeleteButton({ pharmacyId, product }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const { loading, fn, error } = useSubmit(deletePharmacyProduct, "Product removed from catalog");

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive h-8 px-2.5"
        onClick={() => setShowConfirm(true)}
        disabled={loading}
      >
        Remove
      </Button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-semibold text-foreground">Remove from catalog?</h3>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to remove <strong className="text-foreground">{product.name}</strong> from your pharmacy catalog? This action will remove the product from store listings.
            </p>
            <ErrorText error={error} />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowConfirm(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <form action={async (formData) => {
                await fn(formData);
                setShowConfirm(false);
              }}>
                <input type="hidden" name="pharmacyId" value={pharmacyId} />
                <input type="hidden" name="productId" value={product.id} />
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={loading}
                >
                  {loading ? "Removing…" : "Confirm Remove"}
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function PharmacyProductAvailabilityForm({ pharmacyId, product }) {
  const isExpired = product?.expiryDate ? isProductExpired(product.expiryDate) : false;
  const { loading, fn, error } = useSubmit(setPharmacyProductAvailability, "Product availability updated");

  if (isExpired) {
    return (
      <div className="flex items-center text-xs text-destructive font-medium px-2 py-1">
        <span>Expired (cannot dispense)</span>
      </div>
    );
  }

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

export function PharmacyRequestActionForm({ pharmacyId, request }) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const { loading, fn, error } = useSubmit(updatePharmacyDispensingRequestStatus, "Request status updated");

  const handleAction = async (status, note = null) => {
    const fd = new FormData();
    fd.set("pharmacyId", pharmacyId);
    fd.set("requestId", request.id);
    fd.set("status", status);
    if (note) fd.set("note", note);
    await fn(fd);
  };

  const isTerminal = ["COMPLETED", "REJECTED", "CANCELLED"].includes(request.status);
  if (isTerminal) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/70">
      <ErrorText error={error} />
      {request.status === "AWAITING_STORE_CONFIRMATION" && (
        <>
          <Button
            type="button"
            size="sm"
            onClick={() => handleAction("CONFIRMED")}
            disabled={loading}
            className="text-xs font-medium h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? "Updating…" : "Accept & Prepare"}
          </Button>
          {!rejecting ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRejecting(true)}
              disabled={loading}
              className="text-xs text-destructive hover:bg-destructive/10 h-8"
            >
              Decline
            </Button>
          ) : (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Input
                placeholder="Reason for declining..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="h-8 text-xs w-48"
                maxLength={200}
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => { handleAction("REJECTED", rejectReason); setRejecting(false); }}
                disabled={loading}
                className="text-xs h-8"
              >
                Confirm Decline
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRejecting(false)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
            </div>
          )}
        </>
      )}

      {request.status === "CONFIRMED" && (
        <>
          <Button
            type="button"
            size="sm"
            onClick={() => handleAction("READY_FOR_PICKUP")}
            disabled={loading}
            className="text-xs font-medium h-8 bg-primary text-primary-foreground"
          >
            {loading ? "Updating…" : "Mark Ready for Pickup"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleAction("REJECTED", "Out of stock during fulfillment")}
            disabled={loading}
            className="text-xs text-destructive hover:bg-destructive/10 h-8"
          >
            Decline
          </Button>
        </>
      )}

      {request.status === "READY_FOR_PICKUP" && (
        <Button
          type="button"
          size="sm"
          onClick={() => handleAction("COMPLETED")}
          disabled={loading}
          className="text-xs font-medium h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {loading ? "Updating…" : "Mark Dispensed & Complete"}
        </Button>
      )}
    </div>
  );
}

export function PatientCancelRequestButton({ requestId }) {
  const { loading, fn, error } = useSubmit(cancelPatientDispensingRequest, "Dispensing request cancelled");

  return (
    <div className="inline-flex items-center gap-2">
      <form action={fn}>
        <input type="hidden" name="requestId" value={requestId} />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={loading}
          className="text-xs text-destructive hover:bg-destructive/10 h-7 px-2.5"
        >
          {loading ? "Cancelling…" : "Cancel Request"}
        </Button>
      </form>
      <ErrorText error={error} />
    </div>
  );
}
