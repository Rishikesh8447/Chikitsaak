import { User, BadgeCheck, CalendarDays, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";

export function DoctorCard({ doctor }) {
  const name = typeof doctor.name === "string" && doctor.name.trim() && !/^(null|undefined)(\s+(null|undefined))?$/i.test(doctor.name.trim()) ? doctor.name.trim() : "Doctor";
  const specialty = typeof doctor.specialty === "string" && doctor.specialty.trim() ? doctor.specialty.trim() : "general";
  const specialtyLabel = specialty === "general" ? "Healthcare specialist" : specialty;
  const location = [doctor.city, doctor.state, doctor.country].filter((value) => typeof value === "string" && value.trim()).join(", ");

  return (
    <Card className="h-full min-w-0 py-0 transition-colors hover:border-primary/40">
      <CardContent className="flex h-full min-w-0 flex-col p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10">
            {doctor.imageUrl ? <Image src={doctor.imageUrl} alt={name} width={56} height={56} className="size-14 object-cover" /> : <User className="size-6 text-primary" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h2 className="min-w-0 break-words text-base font-semibold tracking-tight sm:text-lg">{name}</h2>
              <Badge variant="outline" className="shrink-0 gap-1 border-primary/20 bg-primary/5 text-primary"><BadgeCheck className="size-3.5" />Verified</Badge>
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground"><span className="font-medium text-primary">{specialtyLabel}</span>{doctor.experience !== null && doctor.experience !== undefined && <span><span aria-hidden="true">·</span> {doctor.experience} years experience</span>}</div>
            {location && <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground"><MapPin className="size-3.5 shrink-0" />{location}</p>}
            {doctor.description ? <p className="mt-3 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-muted-foreground">{doctor.description}</p> : <p className="mt-3 min-h-[4.5rem] text-sm leading-6 text-muted-foreground">No professional description provided.</p>}
          </div>
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><span className="text-xs text-muted-foreground">Verified care provider</span><Button asChild size="sm" className="min-h-9"><Link href={`/doctors/${encodeURIComponent(specialty)}/${doctor.id}`}><CalendarDays className="size-4" />View profile</Link></Button></div>
      </CardContent>
    </Card>
  );
}
