"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, FileText, FlaskConical, Home, Pill, Search } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/doctors", label: "Care", icon: Search, exact: false },
  { href: "/appointments", label: "Visits", icon: Calendar, exact: false },
  { href: "/laboratory", label: "Labs", icon: FlaskConical, exact: false },
  { href: "/pharmacy", label: "Pharmacy", icon: Pill, exact: false },
  { href: "/medical-records", label: "Records", icon: FileText, exact: false },
];

export function BottomNavigation() {
  const pathname = usePathname();

  // Hide on auth routes or in video consultations
  if (pathname?.startsWith("/sign-in") || pathname?.startsWith("/sign-up") || pathname?.startsWith("/video-call")) {
    return null;
  }

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 block border-t border-border/80 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex h-16 items-center justify-around px-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact ? pathname === href : pathname?.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center justify-center py-1.5 transition-colors ${
                isActive
                  ? "font-semibold text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div
                className={`flex size-8 items-center justify-center rounded-full transition-all ${
                  isActive ? "bg-secondary text-primary" : ""
                }`}
              >
                <Icon className="size-4" />
              </div>
              <span className="text-[11px] leading-tight tracking-tight">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
