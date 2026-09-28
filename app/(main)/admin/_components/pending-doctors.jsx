"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, User, Medal, FileText, ExternalLink } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { updateDoctorStatus } from "@/actions/admin";
import useFetch from "@/hooks/use-fetch";
import { useEffect } from "react";
import { BarLoader } from "react-spinners";

function doctorDisplayName(value) {
  if (typeof value !== "string") return "Name unavailable";
  const name = value.trim();
  return name && !/^(null|undefined)(\s+(null|undefined))*$/i.test(name)
    ? name
    : "Name unavailable";
}

function doctorExperience(value, includeDescriptor = false) {
  if (!Number.isInteger(value) || value < 0) return "Experience not provided";
  return `${value} years${includeDescriptor ? " experience" : ""}`;
}

function doctorSpecialty(value) {
  if (typeof value !== "string") return "Specialty not provided";
  const specialty = value.trim();
  return specialty && !/^(null|undefined)$/i.test(specialty)
    ? specialty
    : "Specialty not provided";
}

export function PendingDoctors({ doctors }) {
  const [selectedDoctor, setSelectedDoctor] = useState(null);

  // Custom hook for approve/reject server action
  const {
    loading,
    data,
    fn: submitStatusUpdate,
  } = useFetch(updateDoctorStatus);

  // Open doctor details dialog
  const handleViewDetails = (doctor) => {
    setSelectedDoctor(doctor);
  };

  // Close doctor details dialog
  const handleCloseDialog = () => {
    setSelectedDoctor(null);
  };

  // Handle approve or reject doctor
  const handleUpdateStatus = async (doctorId, status) => {
    if (loading) return;

    const formData = new FormData();
    formData.append("doctorId", doctorId);
    formData.append("status", status);

    await submitStatusUpdate(formData);
  };

  useEffect(() => {
    if (data && data?.success) {
      handleCloseDialog();
    }
  }, [data]);

  return (
    <div>
      <Card className="border-border shadow-none">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground">
            Pending Doctor Verifications
          </CardTitle>
          <CardDescription>
            Review and approve doctor applications
          </CardDescription>
        </CardHeader>
        <CardContent>
          {doctors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No pending verification requests at this time.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {doctors.map((doctor) => (
                <Card
                  key={doctor.id}
                  className="rounded-none border-0 border-b border-border bg-transparent shadow-none last:border-0"
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-muted/20 rounded-full p-2">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium text-foreground">
                            {doctorDisplayName(doctor.name)}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {doctorSpecialty(doctor.specialty)} · {doctorExperience(doctor.experience, true)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end md:self-auto">
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                        >
                          Pending
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetails(doctor)}
                          className="border-emerald-900/30 hover:bg-muted/80"
                        >
                          View Details
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Doctor Details Dialog */}
      {selectedDoctor && (
        <Dialog open={!!selectedDoctor} onOpenChange={handleCloseDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-foreground">
                Doctor Verification Details
              </DialogTitle>
              <DialogDescription>
                Review the doctor&apos;s information carefully before making a
                decision
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Basic Info */}
              <div className="flex flex-col md:flex-row gap-6">
                <div className="space-y-1 flex-1">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Full Name
                  </h4>
                  <p className="text-base font-medium text-foreground">
                    {doctorDisplayName(selectedDoctor.name)}
                  </p>
                </div>
                <div className="space-y-1 flex-1">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Email
                  </h4>
                  <p className="text-base font-medium text-foreground">
                    {selectedDoctor.email}
                  </p>
                </div>
                <div className="space-y-1 flex-1">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Application Date
                  </h4>
                  <p className="text-base font-medium text-foreground">
                    {format(new Date(selectedDoctor.createdAt), "PPP")}
                  </p>
                </div>
              </div>

              <Separator className="bg-emerald-900/20" />

              {/* Professional Details */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Medal className="h-5 w-5 text-primary" />
                  <h3 className="text-foreground font-medium">
                    Professional Information
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6">
                  <div className="space-y-1">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      Specialty
                    </h4>
                    <p className="text-foreground">{doctorSpecialty(selectedDoctor.specialty)}</p>
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      Years of Experience
                    </h4>
                    <p className="text-foreground">{doctorExperience(selectedDoctor.experience)}</p>
                  </div>

                  <div className="space-y-1 col-span-2">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      Credentials
                    </h4>
                    <div className="flex items-center">
                      <a
                        href={selectedDoctor.credentialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-emerald-300 flex items-center"
                      >
                        View Credentials
                        <ExternalLink className="h-4 w-4 ml-1" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              <Separator className="bg-emerald-900/20" />

              {/* Description */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="text-foreground font-medium">
                    Service Description
                  </h3>
                </div>
                <p className="text-muted-foreground whitespace-pre-line">
                  {selectedDoctor.description}
                </p>
              </div>
            </div>

            {loading && <BarLoader width={"100%"} color="#36d7b7" />}

            <DialogFooter className="flex sm:justify-between">
              <Button
                variant="destructive"
                onClick={() =>
                  handleUpdateStatus(selectedDoctor.id, "REJECTED")
                }
                disabled={loading}
                className="bg-red-600 hover:bg-red-700"
              >
                <X className="mr-2 h-4 w-4" />
                Reject
              </Button>
              <Button
                onClick={() =>
                  handleUpdateStatus(selectedDoctor.id, "VERIFIED")
                }
                disabled={loading}
                className="bg-primary hover:bg-primary/90"
              >
                <Check className="mr-2 h-4 w-4" />
                Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
