"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AlertCircle, BarChart3, Calendar, CreditCard, FileText, FlaskConical, Home, Pill, Search, Users } from "lucide-react";
import { useLanguage } from "./language-provider";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/doctors", label: "Care", icon: Search, exact: false },
  { href: "/appointments", label: "Visits", icon: Calendar, exact: false },
  { href: "/laboratory", label: "Labs", icon: FlaskConical, exact: false },
  { href: "/pharmacy", label: "Pharmacy", icon: Pill, exact: false },
  { href: "/medical-records", label: "Records", icon: FileText, exact: false },
];

const ADMIN_NAV_ITEMS = [
  { href: "/admin?tab=pending", label: "Pending", icon: AlertCircle, tab: "pending" },
  { href: "/admin?tab=doctors", label: "Doctors", icon: Users, tab: "doctors" },
  { href: "/admin?tab=payouts", label: "Payouts", icon: CreditCard, tab: "payouts" },
  { href: "/admin/laboratory", label: "Labs", icon: FlaskConical, exactHref: "/admin/laboratory" },
  { href: "/admin/pharmacy", label: "Pharmacy", icon: Pill, exactHref: "/admin/pharmacy" },
  { href: "/admin?tab=analytics", label: "Analytics", icon: BarChart3, tab: "analytics" },
];

function BottomNavigationContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useLanguage();

  // Hide on auth routes or in video consultations
  if (
    pathname?.startsWith("/sign-in") ||
    pathname?.startsWith("/sign-up") ||
    pathname?.startsWith("/video-call")
  ) {
    return null;
  }

  const isAdminRoute = pathname === "/admin" || pathname?.startsWith("/admin/");
  const currentTab = searchParams?.get("tab") || "pending";
  const items = isAdminRoute ? ADMIN_NAV_ITEMS : NAV_ITEMS;

  return (
    <nav
      aria-label={isAdminRoute ? "Admin Mobile Bottom Navigation" : "Mobile Bottom Navigation"}
      className="fixed bottom-0 left-0 right-0 z-40 block border-t border-border/80 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex h-16 items-center justify-around px-1">
        {items.map(({ href, label, icon: Icon, exact, tab, exactHref }) => {
          const isActive = isAdminRoute
            ? Boolean(exactHref ? pathname === exactHref : pathname === "/admin" && currentTab === tab)
            : Boolean(exact ? pathname === href : pathname?.startsWith(href));

          const displayLabel = isAdminRoute ? label : t(`nav.${label.toLowerCase()}`, label);

          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 min-w-0 flex-col items-center justify-center py-1 transition-colors ${
                isActive
                  ? "font-semibold text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div
                className={`flex size-7 min-[360px]:size-8 items-center justify-center rounded-full transition-all ${
                  isActive ? "bg-secondary text-primary" : ""
                }`}
              >
                <Icon className="size-4 shrink-0" />
              </div>
              <span className="max-w-full truncate px-0.5 text-[10px] min-[360px]:text-[11px] leading-tight tracking-tight">
                {displayLabel}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function BottomNavigation() {
  return (
    <Suspense fallback={null}>
      <BottomNavigationContent />
    </Suspense>
  );
}
