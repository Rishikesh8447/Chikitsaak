import { User, Star, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function DoctorCard({ doctor }) {
  const name = typeof doctor.name === "string" && doctor.name.trim() ? doctor.name.trim() : "Doctor";
  const specialty = typeof doctor.specialty === "string" && doctor.specialty.trim() ? doctor.specialty.trim() : "general";
  const specialtyLabel = specialty === "general" ? "Healthcare specialist" : specialty;
  const location = [doctor.city, doctor.state, doctor.country].filter((value) => typeof value === "string" && value.trim()).join(", ");

  return (
    <Card className="h-full border-emerald-900/20 transition-colors hover:border-emerald-500/50">
      <CardContent className="flex h-full flex-col">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-900/20">
            {doctor.imageUrl ? <img src={doctor.imageUrl} alt={name} className="h-12 w-12 rounded-full object-cover" /> : <User className="h-6 w-6 text-emerald-500" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-2 flex min-w-0 flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 break-words text-lg font-semibold">{name}</h3>
              <Badge variant="outline" className="shrink-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Star className="h-3 w-3" />Verified</Badge>
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span>{specialtyLabel}</span>
              {doctor.experience !== null && doctor.experience !== undefined && <span>• {doctor.experience} years experience</span>}
            </div>
            {location && <p className="mt-1 truncate text-sm text-muted-foreground">{location}</p>}
            {doctor.description ? <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{doctor.description}</p> : <p className="mt-4 text-sm text-muted-foreground">Professional profile details available on the doctor&apos;s profile.</p>}
            <Button asChild className="mt-5 w-full bg-emerald-600 hover:bg-emerald-700"><Link href={`/doctors/${encodeURIComponent(specialty)}/${doctor.id}`}><Calendar className="mr-2 h-4 w-4" />View Profile &amp; Book</Link></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
