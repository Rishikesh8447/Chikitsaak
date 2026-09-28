import Link from "next/link";
import Image from "next/image";
import { Show } from "@clerk/nextjs";
import { CalendarDays, CreditCard, FileHeart, LayoutDashboard, Search, ShieldCheck, UserRound } from "lucide-react";
import ThemeToggle from "./theme-toggle";
import { checkUser } from "@/lib/checkUser";
import HeaderAuth from "./header-auth";
import { NotificationCenter } from "./notification-center";

const roleLinks = {
  PATIENT: [
    { href: "/doctors", label: "Find care", icon: Search },
    { href: "/appointments", label: "Appointments", icon: CalendarDays },
    { href: "/medical-records", label: "Medical records", icon: FileHeart },
  ],
  DOCTOR: [{ href: "/doctor", label: "Doctor workspace", icon: LayoutDashboard }],
  ADMIN: [{ href: "/admin", label: "Administration", icon: ShieldCheck }],
  UNASSIGNED: [{ href: "/onboarding", label: "Complete profile", icon: UserRound }],
};

const Header = async ({ user: initialUser } = {}) => {
  const user = initialUser === undefined ? await checkUser() : initialUser;
  const links = roleLinks[user?.role] || [];

  return (
    <header className="sticky top-0 z-40 border-b border-border/90 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Chikitsaak home" className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="relative block size-9 overflow-hidden rounded-xl bg-white ring-1 ring-border sm:size-10">
            <Image src="/LightModelogo.png" alt="" fill sizes="40px" className="object-cover dark:hidden" priority />
            <Image src="/DarkModeLogo.png" alt="" fill sizes="40px" className="hidden object-cover dark:block" priority />
          </span>
          <span className="hidden leading-tight sm:block"><span className="block text-[15px] font-bold tracking-tight text-foreground">Chikitsaak</span><span className="block text-[10px] font-medium tracking-wide text-muted-foreground">CARE, CONNECTED</span></span>
        </Link>

        <nav aria-label="Primary" className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 xl:flex">
          <Show when="signed-in">
            {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon className="size-4" />{label}</Link>)}
            {user?.role === "PATIENT" && <Link href="/credits" className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><CreditCard className="size-4" />Credits</Link>}
          </Show>
          <Show when="signed-out">
            <Link href="/doctors" className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Search className="size-4" />Find care</Link>
            <Link href="/#pricing" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Plans</Link>
          </Show>
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Show when="signed-in">
            {user?.role !== "ADMIN" && user && <Link href="/credits" aria-label={`Open credit balance: ${user.credits} credits`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 sm:px-3"><CreditCard className="size-3.5" /><span>{user.credits}</span><span className="hidden sm:inline">credits</span></Link>}
            {user && <NotificationCenter />}
          </Show>
          <ThemeToggle />
          <HeaderAuth />
        </div>
      </div>

      <nav aria-label="Mobile" className="flex gap-1 overflow-x-auto border-t border-border/70 px-3 py-1.5 xl:hidden">
        <Show when="signed-in">
          {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon className="size-3.5" />{label}</Link>)}
          {user?.role === "PATIENT" && <Link href="/credits" className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><CreditCard className="size-3.5" />Credits</Link>}
        </Show>
        <Show when="signed-out">
          <Link href="/doctors" className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Search className="size-3.5" />Find care</Link>
          <Link href="/#pricing" className="inline-flex min-h-9 shrink-0 items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Plans</Link>
        </Show>
      </nav>
    </header>
  );
};

export default Header;
