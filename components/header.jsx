import React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Show,
} from "@clerk/nextjs";

import {
  Calendar,
  ShieldCheck,
  Stethoscope,
  User,
  CreditCard,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ThemeToggle from "./theme-toggle";
import { checkUser } from "@/lib/checkUser";
import HeaderAuth from "./header-auth";
import { NotificationCenter } from "./notification-center";

const Header = async ({ user: initialUser } = {}) => {
  let user = initialUser;

  if (user === undefined) {
    user = await checkUser();
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="mx-auto flex min-h-16 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6">

        {/* Logo */}
        <Link href="/" className="flex items-center">
          <div className="h-11 w-11 overflow-hidden rounded-full sm:h-14 sm:w-14">
            {/* Light Logo */}
            <Image
              src="/lightModeLogo.png"
              alt="Chikitsaak Logo"
              width={56}
              height={56}
              className="block dark:hidden w-full h-full object-cover"
              priority
            />

            {/* Dark Logo */}
            <Image
              src="/darkModeLogo.png"
              alt="Chikitsaak Logo"
              width={56}
              height={56}
              className="hidden dark:block w-full h-full object-cover"
              priority
            />
          </div>
        </Link>

        {/* Right Side */}
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">

          <Show when="signed-in">

            {/* Admin */}
            {user?.role === "ADMIN" && (
              <Link href="/admin">
                <Button
                  variant="outline"
                  className="hidden md:inline-flex items-center gap-2"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Admin Dashboard
                </Button>

                <Button
                  variant="ghost"
                  className="h-10 w-10 p-0 md:hidden"
                >
                  <ShieldCheck className="h-4 w-4" />
                </Button>
              </Link>
            )}

            {/* Doctor */}
            {user?.role === "DOCTOR" && (
              <Link href="/doctor">
                <Button
                  variant="outline"
                  className="hidden md:inline-flex items-center gap-2"
                >
                  <Stethoscope className="h-4 w-4" />
                  Doctor Dashboard
                </Button>

                <Button
                  variant="ghost"
                  className="h-10 w-10 p-0 md:hidden"
                >
                  <Stethoscope className="h-4 w-4" />
                </Button>
              </Link>
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

          {/* Pricing / Credits */}
          {(!user || user?.role !== "ADMIN") && (
            <Link href={user ? "/credits" : "#pricing"}>
              <Badge
                variant="outline"
                className="h-9 bg-emerald-500/10 border-emerald-500/30 dark:bg-emerald-500/20 dark:border-emerald-500/30 px-3 py-1 flex items-center gap-2 font-medium"
              >
                <CreditCard className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />

                <span className="text-emerald-700 dark:text-emerald-400">
                  {user && user.role !== "ADMIN" ? (
                    <>
                      {user.credits}{" "}
                      <span className="hidden md:inline">
                        {user.role === "PATIENT"
                          ? "Credits"
                          : "Earned Credits"}
                      </span>
                    </>
                  ) : (
                    <>Pricing</>
                  )}
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
