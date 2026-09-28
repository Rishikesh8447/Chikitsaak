"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DoctorCard } from "@/components/doctor-card";
import { searchDoctors } from "@/actions/doctors-listing";
import { SPECIALTIES } from "@/lib/specialities";
import { Label } from "@/components/ui/label";

export function DoctorSearch({ initialDoctors = [] }) {
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const [minExperience, setMinExperience] = useState("");
  const [availableToday, setAvailableToday] = useState(false);
  const [doctors, setDoctors] = useState(initialDoctors);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runSearch = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await searchDoctors({ query, specialty, city, state, country, minExperience, availableToday });
      if (result.error) {
        setError(result.error);
        setDoctors([]);
        return;
      }
      setDoctors(result.doctors || []);
    } catch {
      setError("Unable to search doctors right now. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setQuery("");
    setSpecialty("");
    setCity("");
    setState("");
    setCountry("");
    setMinExperience("");
    setAvailableToday(false);
    setError("");
    setDoctors(initialDoctors);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-4"><h2 className="text-sm font-semibold">Search clinicians</h2><p className="mt-1 text-xs text-muted-foreground">Filter by specialty, location, or experience.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="doctor-query">Doctor or specialty</Label><Input id="doctor-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Dr. Mehta or cardiology" /></div>
          <div className="space-y-1.5"><Label htmlFor="doctor-specialty">Specialty</Label><select id="doctor-specialty" value={specialty} onChange={(event) => setSpecialty(event.target.value)} className="h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"><option value="">All specialties</option>{SPECIALTIES.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="doctor-experience">Minimum experience</Label><Input id="doctor-experience" type="number" min="0" value={minExperience} onChange={(event) => setMinExperience(event.target.value)} placeholder="Any experience" /></div>
          <div className="space-y-1.5"><Label htmlFor="doctor-city">City</Label><Input id="doctor-city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Any city" /></div>
          <div className="space-y-1.5"><Label htmlFor="doctor-state">State or region</Label><Input id="doctor-state" value={state} onChange={(event) => setState(event.target.value)} placeholder="Any region" /></div>
          <div className="space-y-1.5"><Label htmlFor="doctor-country">Country</Label><Input id="doctor-country" value={country} onChange={(event) => setCountry(event.target.value)} placeholder="Any country" /></div>
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="inline-flex min-h-10 items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={availableToday} onChange={(event) => setAvailableToday(event.target.checked)} className="size-4 shrink-0 accent-primary" />Available today</label>
          <div className="flex gap-2"><Button onClick={runSearch} disabled={loading} className="min-w-36">{loading ? "Searching…" : "Search doctors"}</Button><Button variant="outline" onClick={clearFilters} disabled={loading}>Clear</Button></div>
        </div>
      </div>
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
      {loading ? <p className="py-8 text-center text-sm text-muted-foreground" role="status">Searching verified doctors…</p> : doctors.length === 0 ? <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center"><p className="font-medium">No doctors match your current filters.</p><p className="mt-1 text-sm text-muted-foreground">Try another search or clear some filters.</p><Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">Clear filters</Button></div> : <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{doctors.map((doctor) => <DoctorCard key={doctor.id} doctor={doctor} />)}</div>}
    </div>
  );
}
