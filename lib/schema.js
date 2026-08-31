import z from "zod";

export const doctorFormSchema = z.object({
  specialty: z.string().min(1, "Specialty is required"),
  experience: z
    .number({ invalid_type_error: "Experience must be a number" })
    .int()
    .min(1, "Experience must be at least 1 year")
    .max(70, "Experience must be less than 70 years"),
  credentialUrl: z
    .string()
    .url("Please enter a valid URL")
    .min(1, "Credential URL is required"),
  description: z
    .string()
    .min(20, "Description must be at least 20 characters")
    .max(1000, "Description cannot exceed 1000 characters"),
  city: z.string().trim().min(2, "City is required").max(100, "City is too long"),
  state: z.string().trim().min(2, "State or region is required").max(100, "State or region is too long"),
  country: z.string().trim().min(2, "Country is required").max(100, "Country is too long"),
});
