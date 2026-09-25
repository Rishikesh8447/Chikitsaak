"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminDashboardLink() {
  const pathname = usePathname();

  if (pathname === "/admin") {
    return <span className="hidden items-center gap-2 text-sm font-medium text-muted-foreground md:inline-flex"><ShieldCheck className="h-4 w-4" />Admin Dashboard</span>;
  }

  return <Link href="/admin" aria-label="Go to Admin Dashboard"><Button variant="outline" className="hidden items-center gap-2 md:inline-flex"><ShieldCheck className="h-4 w-4" />Admin Dashboard</Button><Button variant="ghost" aria-label="Go to Admin Dashboard" className="h-10 w-10 p-0 md:hidden"><ShieldCheck className="h-4 w-4" /></Button></Link>;
}
