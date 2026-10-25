"use client";

import { useEffect, useState } from "react";
import { updateConsultationPrice } from "@/actions/doctor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import useFetch from "@/hooks/use-fetch";
import { toast } from "sonner";

export function ConsultationPriceForm({ priceRupees }) {
  const [priceValue, setPriceValue] = useState(String(priceRupees ?? ""));
  const { loading, data, fn: savePrice } = useFetch(updateConsultationPrice);
  useEffect(() => {
    if (data?.success) toast.success("Consultation price updated");
    else if (data?.message) toast.error(data.message);
  }, [data]);

  async function submit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await savePrice(formData);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor="consultationPriceRupees">Consultation price (₹ per 20-minute visit)</Label>
        <Input id="consultationPriceRupees" name="consultationPriceRupees" type="number" min="1" max="100000" step="1" value={priceValue} onChange={(event) => setPriceValue(event.target.value)} required className="max-w-56" />
        <p className="text-xs text-muted-foreground">Set a whole rupee amount from ₹1 to ₹100,000. Online patients pay this price at booking.</p>
      </div>
      <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save price"}</Button>
    </form>
  );
}
