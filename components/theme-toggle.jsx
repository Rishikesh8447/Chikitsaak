"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { LoaderCircle, Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <button type="button" aria-label="Loading theme switcher" disabled className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /></button>;
  }

  const isDark = resolvedTheme === "dark";
  return (
    <button type="button" onClick={() => setTheme(isDark ? "light" : "dark")} aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"} title={isDark ? "Switch to light theme" : "Switch to dark theme"} className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
