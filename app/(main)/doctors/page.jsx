import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { SPECIALTIES } from "@/lib/specialities";
import { searchDoctors } from "@/actions/doctors-listing";
import { DoctorSearch } from "@/components/doctor-search";

export default async function DoctorsPage() {
  const { doctors } = await searchDoctors();
  return (
    <div className="mx-auto w-full max-w-7xl overflow-x-hidden px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-7 max-w-2xl">
        <p className="eyebrow">Find care</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">A doctor who fits your needs.</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">Explore verified healthcare providers and find a time that works for you.</p>
      </div>
      <DoctorSearch initialDoctors={doctors} />
      <div className="mb-5 mt-12"><p className="eyebrow">Explore</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Browse by specialty</h2></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
        {SPECIALTIES.map((specialty) => (
          <Link key={specialty.name} href={`/doctors/${encodeURIComponent(specialty.name)}`} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-colors group-hover:border-primary/40">
              <CardContent className="flex h-full items-center gap-4 p-4 sm:p-5">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">
                  {specialty.icon}
                </div>
                <div><h3 className="font-semibold text-foreground">{specialty.name}</h3><p className="mt-0.5 text-xs text-muted-foreground">Browse specialists</p></div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
