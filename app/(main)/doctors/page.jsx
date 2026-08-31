import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { SPECIALTIES } from "@/lib/specialities";
import { searchDoctors } from "@/actions/doctors-listing";
import { DoctorSearch } from "@/components/doctor-search";

export default async function DoctorsPage() {
  const { doctors } = await searchDoctors();
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="flex flex-col items-center justify-center mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-2">Find Your Doctor</h1>
        <p className="text-slate-600 dark:text-slate-300 text-base sm:text-lg">
          Browse by specialty or view all available healthcare providers
        </p>
      </div>
      <DoctorSearch initialDoctors={doctors} />
      <h2 className="mt-12 mb-6 text-2xl font-bold text-slate-900 dark:text-white">Browse by specialty</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
        {SPECIALTIES.map((specialty) => (
          <Link key={specialty.name} href={`/doctors/${specialty.name}`}>
            <Card className="hover:border-emerald-500/40 transition-all cursor-pointer border-border bg-card h-full shadow-xs">
              <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center mb-4 shrink-0">
                  <div className="text-emerald-600 dark:text-emerald-400">{specialty.icon}</div>
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base">{specialty.name}</h3>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
