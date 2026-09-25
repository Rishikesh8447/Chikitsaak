"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DoctorCard } from "@/components/doctor-card";
import { searchDoctors } from "@/actions/doctors-listing";
import { SPECIALTIES } from "@/lib/specialities";

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
    <div className="space-y-4">
      <div className="grid gap-3 border-b border-border pb-5 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search doctor or specialty"
          aria-label="Search doctor or specialty"
        />
        <select value={specialty} onChange={(event) => setSpecialty(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" aria-label="Filter by specialty">
          <option value="">All specialties</option>
          {SPECIALTIES.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
        <Input type="number" min="0" value={minExperience} onChange={(event) => setMinExperience(event.target.value)} placeholder="Minimum experience" />
        <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" />
        <Input value={state} onChange={(event) => setState(event.target.value)} placeholder="State / region" />
        <Input value={country} onChange={(event) => setCountry(event.target.value)} placeholder="Country" />
        <label className="flex h-10 items-center gap-2 px-1 text-sm text-muted-foreground"><input type="checkbox" checked={availableToday} onChange={(event) => setAvailableToday(event.target.checked)} className="h-4 w-4 shrink-0 accent-emerald-600" />Available today</label>
        <div className="flex gap-3">
          <Button onClick={runSearch} disabled={loading} className="flex-1">{loading ? "Searching..." : "Search doctors"}</Button>
          <Button variant="ghost" onClick={clearFilters} disabled={loading}>Clear filters</Button>
        </div>
      </div>
      {error && <p className="text-sm text-red-500 dark:text-red-400" role="alert">{error}</p>}
      {!loading && doctors.length === 0 ? <p className="py-8 text-center text-muted-foreground">No doctors match your search criteria. Try another city or clear your filters.</p> : <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{doctors.map((doctor) => <DoctorCard key={doctor.id} doctor={doctor} />)}</div>}
    </div>
  );
}
