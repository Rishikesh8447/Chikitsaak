"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pill, Search, MapPin, Phone, Building2, ShieldCheck, CheckCircle2, AlertCircle, ShoppingBag, FileText, Info, Send, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/pharmacy-workflow.mjs";
import { submitPharmacyDispensingRequest } from "@/actions/pharmacy";

export function PatientPharmacyCatalog({ products = [], prescriptions = [] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedCity, setSelectedCity] = useState("ALL");
  const [selectedItems, setSelectedItems] = useState({});
  const [patientNote, setPatientNote] = useState("");
  const [orderSubmitted, setOrderSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Extract unique cities from pharmacy locations
  const cities = ["ALL", ...new Set(products.map((p) => p.pharmacy?.city).filter(Boolean))];

  // Extract all prescribed medicine names for automatic verification
  const prescribedMedicineNames = new Set(
    prescriptions.flatMap((rx) => rx.medicines?.map((m) => m.name.toLowerCase().trim()) || [])
  );

  const filteredProducts = products.filter((item) => {
    const matchesSearch =
      !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.description?.toLowerCase().includes(search.toLowerCase()) ||
      item.pharmacy?.name.toLowerCase().includes(search.toLowerCase());

    const matchesCity = selectedCity === "ALL" || item.pharmacy?.city === selectedCity;

    return matchesSearch && matchesCity;
  });

  const handleQuantityChange = (productId, delta) => {
    setSelectedItems((prev) => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: next };
    });
  };

  const selectedCount = Object.values(selectedItems).reduce((sum, q) => sum + q, 0);

  const selectedTotal = Object.entries(selectedItems).reduce((sum, [productId, qty]) => {
    const prod = products.find((p) => p.id === productId);
    return sum + (prod ? Number(prod.price) * qty : 0);
  }, 0);

  const handleConfirmSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError("");

    // Group selected items by pharmacyId
    const pharmacyGroups = {};
    for (const [productId, qty] of Object.entries(selectedItems)) {
      if (qty <= 0) continue;
      const prod = products.find((p) => p.id === productId);
      if (!prod || !prod.pharmacy?.id) continue;
      const phId = prod.pharmacy.id;
      if (!pharmacyGroups[phId]) pharmacyGroups[phId] = [];
      pharmacyGroups[phId].push({ productId, quantity: qty });
    }

    try {
      for (const [pharmacyId, items] of Object.entries(pharmacyGroups)) {
        const fd = new FormData();
        fd.set("pharmacyId", pharmacyId);
        fd.set("items", JSON.stringify(items));
        if (patientNote.trim()) fd.set("patientNote", patientNote.trim());
        await submitPharmacyDispensingRequest(fd);
      }
      toast.success("Dispensing request submitted to partner pharmacy!");
      setSelectedItems({});
      setPatientNote("");
      setOrderSubmitted(false);
      router.refresh();
    } catch (err) {
      setSubmitError(err?.message || "Failed to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Filter Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medicines, generic names, or pharmacy..."
            className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {cities.length > 2 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Location:</span>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="h-10 rounded-xl border border-border bg-card px-3 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city === "ALL" ? "All Locations" : city}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Selected Items Summary / Selection Tray */}
      {selectedCount > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 transition-all">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/20 text-primary">
                <ShoppingBag className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {selectedCount} item{selectedCount > 1 ? "s" : ""} selected
                </p>
                <p className="text-xs text-muted-foreground">
                  Estimated subtotal: <span className="font-semibold text-primary">₹{selectedTotal.toFixed(2)}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setOrderSubmitted(true)}
                className="gap-1.5 text-xs font-medium"
              >
                <CheckCircle2 className="size-3.5" />
                Review & Request Dispensing
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedItems({});
                  setOrderSubmitted(false);
                }}
                className="text-xs text-muted-foreground"
              >
                Clear
              </Button>
            </div>
          </div>

          {/* Submission Modal / Details Box */}
          {orderSubmitted && (
            <div className="mt-4 rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Info className="size-4 text-primary" />
                <span>Pharmacy Fulfillment & Prescription Verification</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Medicines are dispensed by verified, licensed partner pharmacies. In accordance with clinical standards, schedule H/X prescription drugs require an active doctor consultation record.
              </p>

              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-medium text-foreground">
                  Patient notes or delivery / pickup instructions:
                </label>
                <textarea
                  rows={2}
                  value={patientNote}
                  onChange={(e) => setPatientNote(e.target.value)}
                  placeholder="Specify pickup preference, preferred pharmacy branch, or urgent refill request..."
                  className="w-full rounded-md border border-border bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-medium text-foreground">Dispensing Pharmacy Contact:</p>
                {Object.keys(selectedItems).map((id) => {
                  const item = products.find((p) => p.id === id);
                  if (!item) return null;
                  const isPrescribed = prescribedMedicineNames.has(item.name.toLowerCase().trim());
                  return (
                    <div key={id} className="flex flex-wrap items-center justify-between text-muted-foreground py-0.5">
                      <div className="flex items-center gap-1.5">
                        <span>{item.name} × {selectedItems[id]}</span>
                        {isPrescribed && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 text-emerald-600 border-emerald-500/30">
                            Prescription Matched
                          </Badge>
                        )}
                      </div>
                      <span>{item.pharmacy?.name} ({item.pharmacy?.contactPhone || "Store visit"})</span>
                    </div>
                  );
                })}
              </div>

              {submitError && (
                <p role="alert" className="text-xs text-destructive font-medium">
                  {submitError}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleConfirmSubmit}
                    disabled={submitting}
                    className="gap-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="size-3.5" />
                        Confirm & Send Dispensing Request
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setOrderSubmitted(false)}
                    disabled={submitting}
                    className="text-xs text-muted-foreground"
                  >
                    Cancel
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Your dispensing request will be sent to the verified store for confirmation.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Product Catalog Grid */}
      {filteredProducts.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => {
            const isPrescribed = prescribedMedicineNames.has(product.name.toLowerCase().trim());
            const qty = selectedItems[product.id] || 0;

            return (
              <Card key={product.id} className="card-vessel flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Pill className="size-4" />
                    </div>
                    {isPrescribed ? (
                      <Badge variant="default" className="text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-600 text-white">
                        <CheckCircle2 className="size-3" />
                        In Your Prescription
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        {product.isAvailable ? "In Stock" : "Check Store"}
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="mt-3 text-sm font-semibold text-foreground">
                    {product.name}
                  </CardTitle>
                  {product.description && (
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {product.description}
                    </p>
                  )}
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  <div className="flex items-baseline justify-between border-t border-border/60 pt-3">
                    <div>
                      <span className="text-base font-bold text-foreground">₹{product.price}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">incl. taxes</span>
                      {product.expiryDate && (
                        <p className="text-[10px] text-muted-foreground">Expires: {formatDateOnly(product.expiryDate)}</p>
                      )}
                    </div>
                    {product.pharmacy?.city && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MapPin className="size-3" />
                        {product.pharmacy.city}
                      </span>
                    )}
                  </div>

                  {/* Pharmacy Details */}
                  {product.pharmacy && (
                    <div className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground space-y-0.5">
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <Building2 className="size-3 text-primary" />
                        <span className="truncate">{product.pharmacy.name}</span>
                      </div>
                      {product.pharmacy.address && (
                        <p className="truncate pl-4 text-[10px]">{product.pharmacy.address}</p>
                      )}
                      {product.pharmacy.contactPhone && (
                        <p className="flex items-center gap-1 pl-4 text-[10px] text-primary">
                          <Phone className="size-2.5" />
                          <span>{product.pharmacy.contactPhone}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Quantity Selector */}
                  <div className="flex items-center justify-between pt-1">
                    {qty === 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuantityChange(product.id, 1)}
                        className="w-full text-xs font-medium"
                      >
                        Select medicine
                      </Button>
                    ) : (
                      <div className="flex w-full items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-2 py-1">
                        <span className="text-xs font-medium text-primary">Selected:</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleQuantityChange(product.id, -1)}
                            className="flex size-6 items-center justify-center rounded-md border border-border bg-card text-xs font-bold text-foreground hover:bg-muted"
                          >
                            -
                          </button>
                          <span className="w-5 text-center text-xs font-bold text-foreground">{qty}</span>
                          <button
                            onClick={() => handleQuantityChange(product.id, 1)}
                            className="flex size-6 items-center justify-center rounded-md border border-border bg-card text-xs font-bold text-foreground hover:bg-muted"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Pill className="size-6" />
          </div>
          <h3 className="mt-3 text-base font-semibold text-foreground">No products found</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Try adjusting your search terms or location filter.
          </p>
        </div>
      )}
    </div>
  );
}
