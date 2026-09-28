"use client";

import { useRouter } from "next/navigation";
import { AppointmentCard } from "@/components/ui/appointment-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";

export default function DoctorAppointmentsList({ appointments = [] }) {
  const router = useRouter();

  return (
    <Card className="border-border shadow-none">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-foreground flex items-center">
          <Calendar className="mr-2 h-5 w-5 text-primary" />
          Appointments
        </CardTitle>
      </CardHeader>
      <CardContent>
        {appointments.length > 0 ? (
            <div className="divide-y divide-border">
            {appointments.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                userRole="DOCTOR"
                refetchAppointments={() => router.refresh()}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-10 px-4">
            <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-4 rounded-full mb-3">
              <Calendar className="h-8 w-8 text-emerald-600 dark:text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              No upcoming appointments
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              You don&apos;t have any scheduled appointments yet. Make sure
              you&apos;ve set your availability to allow patients to book.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
