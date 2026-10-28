"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VesselHeroSearch({ placeholder = "Search doctors, specialties, or clinical care..." }) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e) => {
    e.preventDefault();
    if (!query.trim()) {
      router.push("/doctors");
      return;
    }
    router.push(`/doctors?query=${encodeURIComponent(query.trim())}`);
  };

  return (
    <form onSubmit={handleSearch} className="relative flex w-full max-w-xl items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <Button type="submit" size="sm" className="ml-2 h-12 shrink-0 rounded-xl px-3 sm:px-5 font-medium">
        <span className="hidden min-[380px]:inline">Find care</span>
        <ArrowRight className="size-4 min-[380px]:ml-1.5" />
      </Button>
    </form>
  );
}
