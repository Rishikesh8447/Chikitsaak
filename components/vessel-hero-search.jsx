"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "./language-provider";

export function VesselHeroSearch({ placeholder }) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { t } = useLanguage();

  const defaultPlaceholder = t("search.placeholder", "Search doctors, specialties, or clinical care...");
  const activePlaceholder = placeholder !== undefined ? placeholder : defaultPlaceholder;

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
      <div className="relative flex-1 min-w-0">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={activePlaceholder}
          className="h-11 sm:h-12 w-full min-w-0 rounded-xl border border-border bg-card pl-10 pr-3.5 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground placeholder:truncate focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <Button
        type="submit"
        size="sm"
        aria-label={t("search.findCareBtn", "Find care")}
        className="ml-2 h-11 sm:h-12 shrink-0 rounded-xl px-3 sm:px-5 font-medium transition-all"
      >
        <span className="hidden min-[420px]:inline">{t("search.findCareBtn", "Find care")}</span>
        <ArrowRight className="size-4 min-[420px]:ml-1.5" />
      </Button>
    </form>
  );
}
