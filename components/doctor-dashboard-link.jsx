"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DoctorDashboardLink() {
  const pathname = usePathname();

  if (pathname === "/doctor") {
    return (
      <span className="hidden items-center gap-2 text-sm font-medium text-muted-foreground md:inline-flex">
        <Stethoscope className="h-4 w-4" />
        Doctor workspace
      </span>
    );
  }

  return (
    <Link href="/doctor" aria-label="Open doctor workspace">
      <Button variant="outline" className="hidden items-center gap-2 md:inline-flex">
        <Stethoscope className="h-4 w-4" />
        Doctor workspace
      </Button>
      <Button variant="ghost" aria-label="Open doctor workspace" className="h-10 w-10 p-0 md:hidden">
        <Stethoscope className="h-4 w-4" />
      </Button>
    </Link>
  );
}
