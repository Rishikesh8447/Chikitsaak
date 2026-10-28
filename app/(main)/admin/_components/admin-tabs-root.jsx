"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import Link from "next/link";
import { FlaskConical, Pill } from "lucide-react";

const VALID_TABS = new Set(["pending", "doctors", "payouts", "refunds", "analytics"]);

function resolveAdminTab(pathname, tab) {
  if (pathname === "/admin/laboratory") return "laboratory";
  if (pathname === "/admin/pharmacy") return "pharmacy";
  if (tab && VALID_TABS.has(tab)) return tab;
  return "pending";
}

function AdminTabsRootContent({ children, className }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const tabParam = searchParams.get("tab");

  const [value, setValue] = useState(() => resolveAdminTab(pathname, tabParam));

  useEffect(() => {
    setValue(resolveAdminTab(pathname, tabParam));
  }, [pathname, tabParam]);

  const handleValueChange = (newVal) => {
    setValue(newVal);
    startTransition(() => {
      const currentRange = searchParams.get("range");
      const rangeParam = currentRange ? `&range=${currentRange}` : "";
      router.push(`/admin?tab=${newVal}${rangeParam}`, { scroll: false });
    });
  };

  return (
    <Tabs value={value} onValueChange={handleValueChange} className={className}>
      {children}
    </Tabs>
  );
}

export function AdminTabsRoot(props) {
  return (
    <Suspense fallback={<Tabs defaultValue="pending" className={props.className}>{props.children}</Tabs>}>
      <AdminTabsRootContent {...props} />
    </Suspense>
  );
}

export function AdminLabNavLink() {
  const active = usePathname() === "/admin/laboratory";
  return (
    <Link
      href="/admin/laboratory"
      aria-current={active ? "page" : undefined}
      data-active={active ? "true" : undefined}
      className={`flex min-h-10 min-w-0 items-center justify-start gap-1.5 whitespace-normal rounded-md border px-2 py-2 text-left text-xs font-medium leading-tight transition-colors lg:justify-start lg:whitespace-nowrap lg:w-full lg:h-auto lg:flex-none ${
        active
          ? "border-primary/20 bg-primary/10 font-semibold text-primary"
          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <FlaskConical className="size-4 shrink-0" />
      <span>Laboratories</span>
    </Link>
  );
}

export function AdminPharmacyNavLink() {
  const active = usePathname() === "/admin/pharmacy";
  return (
    <Link
      href="/admin/pharmacy"
      aria-current={active ? "page" : undefined}
      data-active={active ? "true" : undefined}
      className={`flex min-h-10 min-w-0 items-center justify-start gap-1.5 whitespace-normal rounded-md border px-2 py-2 text-left text-xs font-medium leading-tight transition-colors lg:justify-start lg:whitespace-nowrap lg:w-full lg:h-auto lg:flex-none ${
        active
          ? "border-primary/20 bg-primary/10 font-semibold text-primary"
          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Pill className="size-4 shrink-0" />
      <span>Pharmacies</span>
    </Link>
  );
}
