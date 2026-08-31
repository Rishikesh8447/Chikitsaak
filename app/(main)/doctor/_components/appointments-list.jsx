"use client";

import { useEffect } from "react";
import { getDoctorAppointments } from "@/actions/doctor";
import { AppointmentCard } from "@/components/ui/appointment-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";
import useFetch from "@/hooks/use-fetch";

export default function DoctorAppointmentsList() {
  const {
    loading,
    data,
    fn: fetchAppointments,
  } = useFetch(getDoctorAppointments);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const appointments = data?.appointments || [];

  return (
    <Card className="border-border/80 dark:border-border shadow-xs">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-foreground flex items-center">
          <Calendar className="h-5 w-5 mr-2 text-emerald-600 dark:text-emerald-400" />
          Upcoming Appointments
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">Loading appointments...</p>
          </div>
        ) : appointments.length > 0 ? (
          <div className="space-y-4">
            {appointments.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                userRole="DOCTOR"
                refetchAppointments={fetchAppointments}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-10 px-4">
            <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-4 rounded-full mb-3">
              <Calendar className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
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