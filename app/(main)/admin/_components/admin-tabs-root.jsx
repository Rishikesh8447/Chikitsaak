"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import Link from "next/link";
import { FlaskConical, Pill } from "lucide-react";

export function AdminTabsRoot({ children, className }) {
  const pathname = usePathname();
  const [value, setValue] = useState(() => pathname === "/admin/laboratory" ? "laboratory" : "pending");

  useEffect(() => {
    setValue(pathname === "/admin/laboratory" ? "laboratory" : "pending");
  }, [pathname]);

  return <Tabs value={value} onValueChange={setValue} className={className}>{children}</Tabs>;
}

export function AdminLabNavLink() {
  const active = usePathname() === "/admin/laboratory";
  return <Link
    href="/admin/laboratory"
    aria-current={active ? "page" : undefined}
    data-active={active ? "true" : undefined}
    className={`flex min-h-10 min-w-0 items-center justify-start gap-1.5 whitespace-normal rounded-md border px-2 py-2 text-left text-xs font-medium leading-tight transition-colors lg:justify-start lg:whitespace-nowrap lg:w-full lg:h-auto lg:flex-none ${active ? "border-primary/20 bg-primary/10 font-semibold text-primary" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`}
  >
    <FlaskConical className="size-4 shrink-0" />
    <span>Laboratories</span>
  </Link>;
}

export function AdminPharmacyNavLink() {
  const active = usePathname() === "/admin/pharmacy";
  return <Link href="/admin/pharmacy" aria-current={active ? "page" : undefined} data-active={active ? "true" : undefined}
    className={`flex min-h-10 min-w-0 items-center justify-start gap-1.5 whitespace-normal rounded-md border px-2 py-2 text-left text-xs font-medium leading-tight transition-colors lg:justify-start lg:whitespace-nowrap lg:w-full lg:h-auto lg:flex-none ${active ? "border-primary/20 bg-primary/10 font-semibold text-primary" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
    <Pill className="size-4 shrink-0" /><span>Pharmacies</span>
  </Link>;
}
