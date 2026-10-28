import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SPECIALTIES } from "@/lib/specialities";
import { searchDoctors } from "@/actions/doctors-listing";
import { DoctorSearch } from "@/components/doctor-search";
import { ShieldCheck, Video, Calendar, Sparkles, Stethoscope } from "lucide-react";

export const metadata = {
  title: "Find Certified Physicians & Specialists — Chikitsaak",
  description: "Browse verified clinicians across medical specialties. Book dedicated 20-minute video or clinic consultations.",
};

export default async function DoctorsPage() {
  const { doctors } = await searchDoctors();

  return (
    <div className="mx-auto w-full max-w-7xl overflow-x-hidden px-4 py-8 sm:px-6 sm:py-10 space-y-8">
      {/* Editorial Header */}
      <div className="max-w-3xl space-y-3">
        <Badge variant="outline" className="gap-1.5 border-primary/20 bg-secondary text-primary text-xs">
          <Stethoscope className="size-3.5" />
          <span>Accredited Clinical Faculty</span>
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          Considered care, led by experienced physicians.
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          Browse verified doctors across 12+ clinical specialties. Choose a time that suits your life for dedicated 20-minute video visits or scheduled in-clinic examinations.
        </p>
      </div>

      {/* Trust Standard Badges */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground border-y border-border/70 py-3">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <ShieldCheck className="size-3.5 text-primary" />
          Verified Medical Council Registration
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <Video className="size-3.5 text-primary" />
          Secure HD Video & Clinic Visits
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <Calendar className="size-3.5 text-primary" />
          Transparent Fees with ₹0 Follow-up
        </span>
      </div>

      {/* Interactive Search Component */}
      <section className="space-y-4">
        <DoctorSearch initialDoctors={doctors} />
      </section>

      {/* Specialty Exploration Grid */}
      <section className="pt-4 border-t border-border/70 space-y-4">
        <div>
          <p className="eyebrow">Explore specialties</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
            Browse by Clinical Department
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Connect directly with doctors dedicated to specific health disciplines
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SPECIALTIES.map((specialty) => (
            <Link
              key={specialty.name}
              href={`/doctors/${encodeURIComponent(specialty.name)}`}
              className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="card-vessel h-full transition-all group-hover:border-primary/50 group-hover:shadow-xs">
                <CardContent className="flex h-full items-center gap-4 p-4 sm:p-5">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105 [&_svg]:size-5">
                    {specialty.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors truncate">
                      {specialty.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">Browse specialists →</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
