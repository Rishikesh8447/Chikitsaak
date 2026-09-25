import React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Show,
} from "@clerk/nextjs";

import {
  Calendar,
  User,
  CreditCard,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ThemeToggle from "./theme-toggle";
import { checkUser } from "@/lib/checkUser";
import HeaderAuth from "./header-auth";
import { NotificationCenter } from "./notification-center";
import { DoctorDashboardLink } from "./doctor-dashboard-link";
import { AdminDashboardLink } from "./admin-dashboard-link";

const Header = async ({ user: initialUser } = {}) => {
  let user = initialUser;

  if (user === undefined) {
    user = await checkUser();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">

        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center">
          <div className="h-10 w-10 overflow-hidden rounded-full sm:h-11 sm:w-11">
            {/* Light Logo */}
            <Image
              src="/LightModelogo.png"
              alt="Chikitsaak Logo"
              width={56}
              height={56}
              className="block dark:hidden w-full h-full object-cover"
              priority
            />

            {/* Dark Logo */}
            <Image
              src="/DarkModeLogo.png"
              alt="Chikitsaak Logo"
              width={56}
              height={56}
              className="hidden dark:block w-full h-full object-cover"
              priority
            />
          </div>
        </Link>

        {/* Right Side */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 sm:gap-2">

          <Show when="signed-in">

            {/* Admin */}
            {user?.role === "ADMIN" && (
              <AdminDashboardLink />
            )}

            {/* Doctor */}
            {user?.role === "DOCTOR" && (
              <DoctorDashboardLink />
            )}

            {/* Patient */}
            {user?.role === "PATIENT" && (
              <>
                <Link href="/appointments">
                  <Button variant="outline" className="hidden md:inline-flex items-center gap-2"><Calendar className="h-4 w-4" />My Appointments</Button>
                  <Button variant="ghost" className="md:hidden w-10 h-10 p-0"><Calendar className="h-4 w-4" /></Button>
                </Link>
                <Link href="/medical-records">
                  <Button variant="outline" className="hidden md:inline-flex items-center gap-2"><User className="h-4 w-4" />Medical Records</Button>
                  <Button variant="ghost" aria-label="Open medical records" className="h-10 w-10 p-0 md:hidden"><User className="h-4 w-4" /></Button>
                </Link>
              </>
            )}

            {/* Unassigned */}
            {user?.role === "UNASSIGNED" && (
              <Link href="/onboarding">
                <Button
                  variant="outline"
                  className="hidden md:inline-flex items-center gap-2"
                >
                  <User className="h-4 w-4" />
                  Complete Profile
                </Button>

                <Button
                  variant="ghost"
                  className="h-10 w-10 p-0 md:hidden"
                >
                  <User className="h-4 w-4" />
                </Button>
              </Link>
            )}
          </Show>

          {user && <NotificationCenter />}

          {/* Pricing is secondary navigation; signed-in users retain their credit status. */}
          {!user && (
            <Button asChild variant="ghost" className="h-9 px-3 text-primary hover:text-primary">
              <Link href="#pricing">Pricing</Link>
            </Button>
          )}

          {user?.role !== "ADMIN" && user && (
            <Link href="/credits">
              <Badge
                variant="outline"
                className="h-9 bg-emerald-500/10 border-emerald-500/30 dark:bg-emerald-500/20 dark:border-emerald-500/30 px-3 py-1 flex items-center gap-2 font-medium"
              >
                <CreditCard className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />

                <span className="text-emerald-700 dark:text-emerald-400">
                  {user.credits}{" "}
                  <span className="hidden md:inline">
                    {user.role === "PATIENT" ? "Credits" : "Earned Credits"}
                  </span>
                </span>
              </Badge>
            </Link>
          )}

          {/* Theme Toggle */}
          <ThemeToggle />

          <HeaderAuth />

        </div>
      </nav>
    </header>
  );
};

export default Header;
