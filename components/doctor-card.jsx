import { User, Star, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";

export function DoctorCard({ doctor }) {
  const name =
    typeof doctor.name === "string" &&
    doctor.name.trim() &&
    !/^(null|undefined)(\s+(null|undefined))?$/i.test(doctor.name.trim())
      ? doctor.name.trim()
      : "Doctor";
  const specialty = typeof doctor.specialty === "string" && doctor.specialty.trim() ? doctor.specialty.trim() : "general";
  const specialtyLabel = specialty === "general" ? "Healthcare specialist" : specialty;
  const location = [doctor.city, doctor.state, doctor.country].filter((value) => typeof value === "string" && value.trim()).join(", ");

  return (
    <Card className="h-full min-w-0 transition-colors hover:border-primary/50">
      <CardContent className="flex h-full min-w-0 flex-col">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
            {doctor.imageUrl ? <Image src={doctor.imageUrl} alt={name} width={48} height={48} className="h-12 w-12 rounded-full object-cover" /> : <User className="h-6 w-6 text-emerald-500" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-2 flex min-w-0 flex-wrap items-start justify-between gap-2">
              <h2 className="min-w-0 break-words text-lg font-bold">{name}</h2>
              <Badge variant="outline" className="shrink-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Star className="h-3 w-3" />Verified</Badge>
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span>{specialtyLabel}</span>
              {doctor.experience !== null && doctor.experience !== undefined && <span>• {doctor.experience} years experience</span>}
            </div>
            {location && <p className="mt-1 truncate text-sm text-muted-foreground">{location}</p>}
            {doctor.description ? <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{doctor.description}</p> : <p className="mt-4 text-sm text-muted-foreground">Professional profile details available on the doctor&apos;s profile.</p>}
            <Button asChild variant="outline" className="mt-auto self-start"><Link href={`/doctors/${encodeURIComponent(specialty)}/${doctor.id}`}><Calendar className="mr-2 h-4 w-4" />View Profile &amp; Book</Link></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
