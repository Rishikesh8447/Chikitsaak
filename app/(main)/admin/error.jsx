"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }) {
  useEffect(() => {
    console.error("Admin workspace error:", error);
  }, [error]);

  return (
    <div className="min-w-0 w-full rounded-2xl border border-destructive/20 bg-card p-6 shadow-xs sm:p-8 space-y-4">
      <div className="flex items-center gap-3 text-destructive">
        <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10">
          <AlertCircle className="size-5 shrink-0" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Administration data temporarily unavailable</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Unable to complete data synchronization with the platform database.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
        Please check your network connection or retry the request. Your administration privileges and session remain active.
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button
          onClick={() => reset()}
          size="sm"
          className="gap-2 font-medium"
        >
          <RefreshCcw className="size-3.5" />
          <span>Retry request</span>
        </Button>
      </div>
    </div>
  );
}
