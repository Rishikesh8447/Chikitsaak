import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Calendar, FileText, FlaskConical, HeartPulse, Pill, Search, ShieldCheck, Stethoscope, Video, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VesselHeroSearch } from "./vessel-hero-search";

function formatDateTime(dateString) {
  const d = new Date(dateString);
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(status) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Derives a clean, patient-friendly display name.
 * Strictly avoids Clerk IDs, technical hashes, email prefixes with digits, or fallback tokens.
 */
function getGreetingDisplayName(name) {
  if (!name || typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  if (/^(null|undefined|anonymous|user|patient)$/i.test(trimmed)) return null;
  if (trimmed.includes("@") || trimmed.includes(".com") || trimmed.includes(".org") || trimmed.includes(".net")) return null;
  if (/^user_[a-z0-9]+$/i.test(trimmed)) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return null;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  if (/^dr\.?$/i.test(words[0]) && words[1]) {
    const doctorLastName = words[1];
    if (/\d/.test(doctorLastName)) return null;
    return `Dr. ${doctorLastName.charAt(0).toUpperCase() + doctorLastName.slice(1)}`;
  }

  const firstWord = words[0];
  if (/\d/.test(firstWord)) return null;
  if (firstWord.length < 2 || firstWord.length > 25) return null;

  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
}

export function PatientCareHub({ user, nextAppointment, recentPrescriptions = [], recentLabOrders = [] }) {
  const displayName = getGreetingDisplayName(user?.name);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      {/* Editorial Welcome Header */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8 lg:p-10">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Left Column: Welcome, Search, Specialty Filters */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-center">
            {/* Mobile Compact Faculty Complement */}
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-secondary/35 p-2 lg:hidden">
              <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-secondary">
                <Image
                  src="/banner2.png"
                  alt="Verified medical doctors"
                  fill
                  sizes="44px"
                  className="object-cover object-top"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">Chikitsaak Medical Faculty</p>
                <p className="text-[11px] text-muted-foreground truncate">Accredited clinicians across 12+ specialties</p>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="gap-1.5 border-primary/20 bg-secondary px-3 py-1 text-xs text-primary font-medium">
                <HeartPulse className="size-3.5" />
                <span>Personal Care Hub</span>
              </Badge>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {displayName ? (
                <>
                  Welcome back, <span className="text-primary">{displayName}</span>.
                </>
              ) : (
                <>Welcome back.</>
              )}
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base max-w-xl">
              Your consultations, pathology diagnostics, active prescriptions, and health dossier — coordinated in one calm, private space.
            </p>

            {/* Quick Search */}
            <div className="mt-6 max-w-xl">
              <VesselHeroSearch placeholder="Search specialists, laboratory tests, or medications..." />
            </div>

            {/* Quick Specialty Chips */}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Common specialties:</span>
              {["General Medicine", "Cardiology", "Dermatology", "Pediatrics", "Gynecology"].map((spec) => (
                <Link
                  key={spec}
                  href={`/doctors/${encodeURIComponent(spec)}`}
                  className="rounded-full border border-border bg-background px-3 py-1 transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {spec}
                </Link>
              ))}
            </div>
          </div>

          {/* Right Column: Professional Healthcare Visual (Desktop) */}
          <div className="hidden lg:flex lg:col-span-5 xl:col-span-4 items-center justify-end">
            <div className="relative w-full max-w-[21rem] overflow-hidden rounded-2xl border border-border bg-secondary/35 p-2.5 shadow-xs">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-gradient-to-b from-secondary/40 to-muted/80">
                <Image
                  src="/banner2.png"
                  alt="Board-certified doctors at Chikitsaak"
                  fill
                  priority
                  sizes="(min-width: 1024px) 340px, 100vw"
                  className="object-cover object-top"
                />
              </div>
              <div className="mt-2.5 flex items-center justify-between px-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <ShieldCheck className="size-3.5 text-primary" />
                  Verified Specialists
                </span>
                <span className="text-[11px] text-muted-foreground">20-min Unhurried Visits</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Active Care Status Grid */}
      <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {/* Next Appointment Card */}
        <Card className="card-vessel flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Calendar className="size-3.5" />
                Upcoming visit
              </span>
              {nextAppointment && (
                <Badge variant={nextAppointment.status === "CONFIRMED" ? "default" : "outline"} className="text-xs">
                  {formatStatus(nextAppointment.status)}
                </Badge>
              )}
            </div>
            <CardTitle className="text-base font-semibold text-foreground">
              {nextAppointment ? `Dr. ${nextAppointment.doctor?.name || "Doctor"}` : "No upcoming visits"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {nextAppointment ? (
              <>
                <p className="text-xs text-muted-foreground">{nextAppointment.doctor?.specialty || "Specialist"}</p>
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <Clock className="size-3.5 text-primary" />
                  <span>{formatDateTime(nextAppointment.startTime)}</span>
                  <span className="text-muted-foreground">({nextAppointment.consultationMode === "ONLINE" ? "Video visit" : "In clinic"})</span>
                </div>
                {nextAppointment.payment && (
                  <p className="text-xs text-muted-foreground">
                    Fee: ₹{nextAppointment.payment.amountRupees} · {formatStatus(nextAppointment.payment.status)}
                  </p>
                )}
                <div className="pt-2">
                  {nextAppointment.consultationMode === "ONLINE" ? (
                    <Link
                      href={`/video-call?appointmentId=${encodeURIComponent(nextAppointment.id)}`}
                      className={buttonVariants({ size: "sm", className: "w-full gap-1.5" })}
                    >
                      <Video className="size-3.5" />
                      Join consultation
                    </Link>
                  ) : (
                    <Link
                      href="/appointments"
                      className={buttonVariants({ variant: "outline", size: "sm", className: "w-full" })}
                    >
                      View appointment details
                    </Link>
                  )}
                </div>
              </>
            ) : (
              <div className="py-2">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  You have no visits scheduled right now. Search doctors to book a 20-minute video or clinic consultation.
                </p>
                <Link
                  href="/doctors"
                  className={buttonVariants({ variant: "outline", size: "sm", className: "mt-4 w-full" })}
                >
                  Book a consultation
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Diagnostics & Lab Orders Card */}
        <Card className="card-vessel flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <FlaskConical className="size-3.5" />
                Laboratory tests
              </span>
              <Link href="/laboratory" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <CardTitle className="text-base font-semibold text-foreground">
              {recentLabOrders.length ? "Active Diagnostics" : "Diagnostic Pathology"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {recentLabOrders.length > 0 ? (
              <div className="space-y-2.5">
                {recentLabOrders.map((order) => (
                  <div key={order.id} className="rounded-lg border border-border/70 bg-secondary/30 p-2.5 text-xs">
                    <div className="flex items-center justify-between font-medium">
                      <span className="truncate">{order.items?.map((i) => i.testName).join(", ") || "Lab test"}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {formatStatus(order.status)}
                      </Badge>
                    </div>
                    {order.laboratory?.name && (
                      <p className="mt-1 text-muted-foreground">{order.laboratory.name}</p>
                    )}
                  </div>
                ))}
                <Link
                  href="/laboratory"
                  className={buttonVariants({ variant: "outline", size: "sm", className: "w-full" })}
                >
                  Manage test orders
                </Link>
              </div>
            ) : (
              <div className="py-2">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Order accredited lab tests directly or review diagnostic investigations prescribed by your clinician.
                </p>
                <Link
                  href="/laboratory"
                  className={buttonVariants({ variant: "outline", size: "sm", className: "mt-4 w-full" })}
                >
                  Browse available tests
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Prescriptions & Medications Card */}
        <Card className="card-vessel flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Pill className="size-3.5" />
                Medications
              </span>
              <Link href="/pharmacy" className="text-xs text-primary hover:underline">
                Pharmacy
              </Link>
            </div>
            <CardTitle className="text-base font-semibold text-foreground">
              {recentPrescriptions.length ? "Recent Prescriptions" : "Pharmacy & Medicines"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {recentPrescriptions.length > 0 ? (
              <div className="space-y-2.5">
                {recentPrescriptions.map((rx) => (
                  <div key={rx.id} className="rounded-lg border border-border/70 bg-secondary/30 p-2.5 text-xs">
                    <div className="flex items-center justify-between font-medium">
                      <span>{rx.diagnosis || "Consultation prescription"}</span>
                      {rx.followUpRequired && (
                        <span className="text-[10px] font-semibold text-primary">₹0 Follow-up</span>
                      )}
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {rx.medicines?.map((m) => m.name).join(", ") || "Prescribed medicines"}
                    </p>
                  </div>
                ))}
                <Link
                  href="/medical-records"
                  className={buttonVariants({ variant: "outline", size: "sm", className: "w-full" })}
                >
                  View full prescription
                </Link>
              </div>
            ) : (
              <div className="py-2">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Your prescriptions from completed consultations and medication schedules will be organized here.
                </p>
                <Link
                  href="/pharmacy"
                  className={buttonVariants({ variant: "outline", size: "sm", className: "mt-4 w-full" })}
                >
                  Explore medicines & pharmacy
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* 4 Core Vessel Service Portals */}
      <section className="space-y-4">
        <div>
          <Badge variant="outline" className="text-xs text-primary bg-secondary border-primary/20 mb-2">Healthcare services</Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Comprehensive care portals</h2>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Everything you need for considered, end-to-end outpatient and digital care.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Portal 1: Clinicians */}
          <Link href="/doctors" className="group block focus-visible:outline-none">
            <Card className="card-vessel h-full p-5 transition-colors group-hover:border-primary/50">
              <div className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary transition-transform group-hover:scale-105">
                <Stethoscope className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold text-foreground group-hover:text-primary">Find Doctors</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Browse certified physicians across 12+ specialties with transparent fees and 20-minute consultation slots.
              </p>
              <div className="mt-4 flex items-center text-xs font-medium text-primary">
                <span>Browse clinicians</span>
                <ArrowRight className="ml-1 size-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </Card>
          </Link>

          {/* Portal 2: Appointments */}
          <Link href="/appointments" className="group block focus-visible:outline-none">
            <Card className="card-vessel h-full p-5 transition-colors group-hover:border-primary/50">
              <div className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary transition-transform group-hover:scale-105">
                <Calendar className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold text-foreground group-hover:text-primary">My Appointments</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Review scheduled visits, join secure HD video calls, manage bookings, and access consultation history.
              </p>
              <div className="mt-4 flex items-center text-xs font-medium text-primary">
                <span>Manage visits</span>
                <ArrowRight className="ml-1 size-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </Card>
          </Link>

          {/* Portal 3: Diagnostics */}
          <Link href="/laboratory" className="group block focus-visible:outline-none">
            <Card className="card-vessel h-full p-5 transition-colors group-hover:border-primary/50">
              <div className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary transition-transform group-hover:scale-105">
                <FlaskConical className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold text-foreground group-hover:text-primary">Diagnostic Labs</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Book blood tests, pathology panels, and sample collections from accredited laboratories with certified reports.
              </p>
              <div className="mt-4 flex items-center text-xs font-medium text-primary">
                <span>Schedule lab tests</span>
                <ArrowRight className="ml-1 size-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </Card>
          </Link>

          {/* Portal 4: Pharmacy */}
          <Link href="/pharmacy" className="group block focus-visible:outline-none">
            <Card className="card-vessel h-full p-5 transition-colors group-hover:border-primary/50">
              <div className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary transition-transform group-hover:scale-105">
                <Pill className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold text-foreground group-hover:text-primary">Pharmacy & Medicines</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Discover medicines and products from verified pharmacies, check availability, and review prescription instructions.
              </p>
              <div className="mt-4 flex items-center text-xs font-medium text-primary">
                <span>Explore pharmacy</span>
                <ArrowRight className="ml-1 size-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </Card>
          </Link>
        </div>
      </section>

      {/* Patient Health Dossier Summary */}
      <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <ShieldCheck className="size-3.5" />
              Clinical record
            </span>
            <h2 className="mt-1 text-xl font-semibold text-foreground">Your Medical Dossier</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Blood group: <span className="font-medium text-foreground">{user?.bloodGroup || "Not specified"}</span> ·
              Allergies: <span className="font-medium text-foreground">{user?.allergies || "None recorded"}</span> ·
              Conditions: <span className="font-medium text-foreground">{user?.existingConditions || "None recorded"}</span>
            </p>
          </div>
          <Link
            href="/medical-records"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <FileText className="mr-1.5 size-4" />
            Update health dossier
          </Link>
        </div>
      </section>
    </div>
  );
}
