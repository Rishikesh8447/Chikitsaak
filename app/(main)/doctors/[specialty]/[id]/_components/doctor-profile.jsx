// /app/doctors/[id]/_components/doctor-profile.jsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  User,
  Calendar,
  Clock,
  Medal,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { SlotPicker } from "./slot-picker";
import { AppointmentForm } from "./appointment-form";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function DoctorProfile({ doctor, availableDays, reviews }) {
  const doctorName = typeof doctor.name === "string" && doctor.name.trim() && !/^(null|undefined)(\s+(null|undefined))?$/i.test(doctor.name.trim()) ? doctor.name.trim() : "Doctor";
  const [showBooking, setShowBooking] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const router = useRouter();

  // Calculate total available slots
  const totalSlots = availableDays?.reduce(
    (total, day) => total + day.slots.length,
    0
  );

  const toggleBooking = () => {
    setShowBooking(!showBooking);
    if (!showBooking) {
      // Scroll to booking section when expanding
      setTimeout(() => {
        document.getElementById("booking-section")?.scrollIntoView({
          behavior: "smooth",
        });
      }, 100);
    }
  };

  const handleSlotSelect = (slot) => {
    setSelectedSlot(slot);
  };

  const handleBookingComplete = () => {
    router.push("/appointments");
  };

  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 px-4 py-8 sm:px-6 md:grid-cols-3">
      {/* Left column - Doctor Photo and Quick Info (fixed on scroll) */}
      <div className="md:col-span-1">
        <div className="md:sticky md:top-24">
          <Card className="border-border shadow-xs">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-4 size-24 overflow-hidden rounded-xl bg-primary/10 sm:size-28">
                  {doctor.imageUrl ? (
                    <Image
                      src={doctor.imageUrl}
                      alt={doctorName}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="h-14 w-14 text-primary" />
                    </div>
                  )}
                </div>

                <h2 className="mb-1 text-xl font-semibold">
                  Dr. {doctorName}
                </h2>

                <Badge
                  variant="outline"
                  className="mb-4 border-primary/30 bg-primary/10 text-primary"
                >
                  {doctor.specialty}
                </Badge>

                <div className="flex items-center justify-center mb-2">
                  <Medal className="h-4 w-4 text-emerald-600 dark:text-primary mr-2" />
                  <span className="text-muted-foreground text-sm">
                    {doctor.experience} years experience
                  </span>
                </div>

                {(doctor.city || doctor.state || doctor.country) && (
                  <p className="text-sm text-muted-foreground mb-2">
                    {[doctor.city, doctor.state, doctor.country].filter(Boolean).join(", ")}
                  </p>
                )}

                <div className="mb-2 text-sm text-amber-500 font-medium">
                  {reviews?.average ? `${reviews.average.toFixed(1)} ★` : "No reviews yet"}
                  {reviews?.total ? <span className="ml-1 text-slate-500 dark:text-slate-400">({reviews.total})</span> : null}
                </div>

                <Button
                  onClick={toggleBooking}
                  variant={showBooking ? "ghost" : "default"}
                  className="mt-4 w-full"
                >
                  {showBooking ? (
                    <>
                      Hide Booking
                      <ChevronUp className="ml-2 h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Book Appointment
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right column - Doctor Details and Booking Section */}
      <div className="md:col-span-2 space-y-6">
        <Card className="border-border shadow-xs">
          <CardHeader>
            <CardTitle className="text-lg font-semibold tracking-tight text-foreground">
              About Dr. {doctorName}
            </CardTitle>
            <CardDescription>
              Professional background and expertise
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-600 dark:text-primary" />
                <h3 className="font-semibold text-foreground">Professional profile</h3>
              </div>
              <p className="whitespace-pre-line text-sm leading-7 text-muted-foreground">
                {doctor.description}
              </p>
            </div>

            <Separator className="bg-border" />

              <div className="space-y-3">
              <div className="flex items-center gap-2"><Medal className="h-5 w-5 text-amber-500" /><h3 className="font-semibold text-slate-900 dark:text-foreground">Patient reviews</h3></div>
              {reviews?.reviews?.length ? reviews.reviews.slice(0, 5).map((review) => <div key={review.id} className="rounded-lg border border-border p-3 bg-muted/20"><div className="text-amber-500 text-sm">{"★".repeat(review.rating)}<span className="text-muted-foreground">{"★".repeat(5 - review.rating)}</span></div>{review.comment && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{review.comment}</p>}<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{review.patient.name || "Patient"}</p></div>) : <p className="text-sm text-slate-600 dark:text-slate-300">No reviews yet.</p>}
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-emerald-600 dark:text-primary" />
                <h3 className="font-semibold text-foreground">Availability</h3>
              </div>
              {totalSlots > 0 ? (
                <div className="flex items-center">
                  <Calendar className="h-5 w-5 text-emerald-600 dark:text-primary mr-2 shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    {totalSlots} time slots available for booking over the next
                    4 days
                  </p>
                </div>
              ) : (
                <Alert className="border-border">
                  <AlertCircle className="h-4 w-4 text-emerald-600 dark:text-primary" />
                  <AlertDescription className="text-xs text-muted-foreground">
                    No available slots for the next 4 days. Please check back
                    later.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Booking Section - Conditionally rendered */}
        {showBooking && (
          <div id="booking-section">
              <Card className="border-border shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg font-semibold tracking-tight text-foreground">
                  Book an Appointment
                </CardTitle>
                <CardDescription>
                  Select a time slot and provide details for your consultation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {totalSlots > 0 ? (
                  <>
                    {/* Slot selection step */}
                    {!selectedSlot && (
                      <SlotPicker
                        days={availableDays}
                        onSelectSlot={handleSlotSelect}
                      />
                    )}

                    {/* Appointment form step */}
                    {selectedSlot && (
                      <AppointmentForm
                        doctorId={doctor.id}
                        slot={selectedSlot}
                        onBack={() => setSelectedSlot(null)}
                        onComplete={handleBookingComplete}
                      />
                    )}
                  </>
                ) : (
                  <div className="text-center py-6">
                    <Calendar className="mx-auto mb-3 size-10 text-muted-foreground" />
                    <h3 className="mb-2 text-lg font-semibold text-foreground">
                      No available slots
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      This doctor doesn&apos;t have any available appointment
                      slots for the next 4 days. Please check back later or try
                      another doctor.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
