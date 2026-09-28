"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Stethoscope, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setUserRole } from "@/actions/onboarding";
import { doctorFormSchema } from "@/lib/schema";
import { SPECIALTIES } from "@/lib/specialities";
import useFetch from "@/hooks/use-fetch";
import { useEffect } from "react";

export default function OnboardingPage() {
  const [step, setStep] = useState("choose-role");
  const router = useRouter();

  // Custom hook for user role server action
  const { loading, data, fn: submitUserRole } = useFetch(setUserRole);

  // React Hook Form setup with Zod validation
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    control,
  } = useForm({
    resolver: zodResolver(doctorFormSchema),
    defaultValues: {
      specialty: "",
      experience: undefined,
      credentialUrl: "",
      description: "",
      city: "",
      state: "",
      country: "",
    },
  });

  // Watch specialty value for controlled select component
  const specialtyValue = useWatch({ control, name: "specialty" });

  // Handle patient role selection
  const handlePatientSelection = async () => {
    if (loading) return;

    const formData = new FormData();
    formData.append("role", "PATIENT");

    await submitUserRole(formData);
  };

  useEffect(() => {
    if (data && data?.success) {
      router.push(data.redirect);
    }
  }, [data, router]);

  // Added missing onDoctorSubmit function
  const onDoctorSubmit = async (data) => {
    if (loading) return;

    const formData = new FormData();
    formData.append("role", "DOCTOR");
    formData.append("specialty", data.specialty);
    formData.append("experience", data.experience.toString());
    formData.append("credentialUrl", data.credentialUrl);
    formData.append("description", data.description);
    formData.append("city", data.city);
    formData.append("state", data.state);
    formData.append("country", data.country);

    await submitUserRole(formData);
  };

  // Role selection screen
  if (step === "choose-role") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card
          className="border-emerald-900/20 transition-all"
        >
          <CardContent className="pt-6 pb-6 flex flex-col items-center text-center">
            <div className="p-4 bg-emerald-900/20 rounded-full mb-4">
              <User className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-xl font-semibold text-foreground mb-2">
              Join as a Patient
            </CardTitle>
            <CardDescription className="mb-4">
              Book appointments, consult with doctors, and manage your
              healthcare journey
            </CardDescription>
            <Button
              type="button"
              className="w-full mt-2 bg-primary hover:bg-primary/90"
              disabled={loading}
              onClick={handlePatientSelection}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Continue as Patient"
              )}
            </Button>
          </CardContent>
        </Card>

        <Card
          className="border-emerald-900/20 transition-all"
        >
          <CardContent className="pt-6 pb-6 flex flex-col items-center text-center">
            <div className="p-4 bg-emerald-900/20 rounded-full mb-4">
              <Stethoscope className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-xl font-semibold text-foreground mb-2">
              Join as a Doctor
            </CardTitle>
            <CardDescription className="mb-4">
              Create your professional profile, set your availability, and
              provide consultations
            </CardDescription>
            <Button
              type="button"
              className="w-full mt-2 bg-primary hover:bg-primary/90"
              disabled={loading}
              onClick={() => setStep("doctor-form")}
            >
              Continue as Doctor
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Doctor registration form
  if (step === "doctor-form") {
    return (
      <Card className="border-emerald-900/20">
        <CardContent className="pt-6">
          <div className="mb-6">
            <CardTitle className="text-2xl font-bold text-foreground mb-2">
              Complete Your Doctor Profile
            </CardTitle>
            <CardDescription>
              Please provide your professional details for verification
            </CardDescription>
          </div>

          <form onSubmit={handleSubmit(onDoctorSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="specialty">Medical Specialty</Label>
              <Select
                value={specialtyValue}
                onValueChange={(value) => setValue("specialty", value)}
              >
                <SelectTrigger id="specialty">
                  <SelectValue placeholder="Select your specialty" />
                </SelectTrigger>
                <SelectContent>
                  {SPECIALTIES.map((spec) => (
                    <SelectItem
                      key={spec.name}
                      value={spec.name}
                      className="flex items-center gap-2"
                    >
                      <span className="text-primary">{spec.icon}</span>
                      {spec.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.specialty && (
                <p className="text-sm font-medium text-red-500 mt-1">
                  {errors.specialty.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="experience">Years of Experience</Label>
              <Input
                id="experience"
                type="number"
                placeholder="e.g. 5"
                {...register("experience", { valueAsNumber: true })}
              />
              {errors.experience && (
                <p className="text-sm font-medium text-red-500 mt-1">
                  {errors.experience.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="credentialUrl">Link to Credential Document</Label>
              <Input
                id="credentialUrl"
                type="url"
                placeholder="https://example.com/my-medical-degree.pdf"
                {...register("credentialUrl")}
              />
              {errors.credentialUrl && (
                <p className="text-sm font-medium text-red-500 mt-1">
                  {errors.credentialUrl.message}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Please provide a link to your medical degree or certification
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description of Your Services</Label>
              <Textarea
                id="description"
                placeholder="Describe your expertise, services, and approach to patient care..."
                rows="4"
                {...register("description")}
              />
              {errors.description && (
                <p className="text-sm font-medium text-red-500 mt-1">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" placeholder="e.g. Indore" {...register("city")} />
                {errors.city && <p className="text-sm font-medium text-red-500 mt-1">{errors.city.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State / Region</Label>
                <Input id="state" placeholder="e.g. Madhya Pradesh" {...register("state")} />
                {errors.state && <p className="text-sm font-medium text-red-500 mt-1">{errors.state.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input id="country" placeholder="e.g. India" {...register("country")} />
                {errors.country && <p className="text-sm font-medium text-red-500 mt-1">{errors.country.message}</p>}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("choose-role")}
                className="border-emerald-900/30"
                disabled={loading}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit for Verification"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }
}
