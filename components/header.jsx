import Link from "next/link";
import Image from "next/image";
import { Show } from "@clerk/nextjs";
import { CalendarDays, FileHeart, FlaskConical, LayoutDashboard, Pill, Search, ShieldCheck, UserRound, Users, ClipboardList, Package } from "lucide-react";
import ThemeToggle from "./theme-toggle";
import { checkUser } from "@/lib/checkUser";
import HeaderAuth from "./header-auth";
import { NotificationCenter } from "./notification-center";
import { db } from "@/lib/prisma";
import { measureServerTiming } from "@/lib/server-timing.mjs";

const roleLinks = {
  PATIENT: [
    { href: "/doctors", label: "Find care", icon: Search },
    { href: "/appointments", label: "Appointments", icon: CalendarDays },
    { href: "/medical-records", label: "Medical records", icon: FileHeart },
    { href: "/laboratory", label: "Lab tests", icon: FlaskConical },
    { href: "/pharmacy/workspace", label: "Pharmacy", icon: Pill },
  ],
  DOCTOR: [
    { href: "/doctor", label: "Doctor workspace", icon: LayoutDashboard },
    { href: "/doctor/laboratory", label: "Order lab tests", icon: FlaskConical },
  ],
  ADMIN: [{ href: "/admin", label: "Administration", icon: ShieldCheck }],
  UNASSIGNED: [{ href: "/onboarding", label: "Complete profile", icon: UserRound }],
};

const Header = async ({ user: initialUser } = {}) => {
  const user = initialUser === undefined ? await checkUser() : initialUser;
  const partnerMemberships = user && ["PATIENT", "DOCTOR", "UNASSIGNED"].includes(user.role)
    ? await measureServerTiming("layout.partnerMembershipQueries", () => Promise.all([
        db.laboratoryMembership.findFirst({ where: { userId: user.id, status: "ACTIVE" }, select: { id: true } }),
        db.pharmacyMembership.findFirst({ where: { userId: user.id, status: "ACTIVE" }, select: { id: true } }),
      ]))
    : [];
  const isLaboratoryPartner = Boolean(partnerMemberships[0]);
  const isPharmacyPartner = Boolean(partnerMemberships[1]);
  const isPartner = isLaboratoryPartner || isPharmacyPartner;
  const links = isPartner ? [
    ...(isLaboratoryPartner ? [
      { href: "/laboratory/workspace", label: "Laboratory", icon: FlaskConical },
      { href: "/laboratory/workspace#offerings", label: "Test offerings", icon: ClipboardList },
      { href: "/laboratory/workspace#orders", label: "Assigned orders", icon: CalendarDays },
      { href: "/laboratory/workspace#organization", label: "Organization", icon: Users },
    ] : []),
    ...(isPharmacyPartner ? [
      { href: "/pharmacy/workspace", label: "Pharmacy", icon: Pill },
      { href: "/pharmacy/workspace#catalog", label: "Product catalogue", icon: Package },
      { href: "/pharmacy/workspace#requests", label: "Requests & orders", icon: ClipboardList },
      { href: "/pharmacy/workspace#organization", label: "Organization", icon: Users },
    ] : []),
  ] : roleLinks[user?.role] || [];

  return (
    <header className="sticky top-0 z-40 border-b border-border/90 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6">
        <Link href="/" aria-label="Chikitsaak home" className="flex min-w-0 shrink items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="relative block h-9 w-28 shrink-0 overflow-hidden rounded-lg bg-white px-1 ring-1 ring-border min-[375px]:w-32 sm:h-12 sm:w-52 lg:h-14 lg:w-56">
            <Image src="/chikitsaak-full-logo.png" alt="" fill sizes="(min-width: 1024px) 224px, (min-width: 640px) 208px, 160px" className="object-contain p-1" priority />
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden min-w-0 flex-1 flex-row items-center justify-center gap-0.5 lg:flex">
          <Show when="signed-in">
            {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon className="size-4" />{label}</Link>)}
          </Show>
          <Show when="signed-out">
            <Link href="/doctors" className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Search className="size-4" />Find care</Link>
          </Show>
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Show when="signed-in">
            {user && <NotificationCenter />}
          </Show>
          <ThemeToggle />
          <HeaderAuth />
        </div>
      </div>

      <nav aria-label="Mobile" className="flex gap-1 overflow-x-auto border-t border-border/70 px-3 py-1.5 lg:hidden">
        <Show when="signed-in">
          {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon className="size-3.5" />{label}</Link>)}
        </Show>
        <Show when="signed-out">
          <Link href="/doctors" className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Search className="size-3.5" />Find care</Link>
        </Show>
      </nav>
    </header>
  );
};

export default Header;
