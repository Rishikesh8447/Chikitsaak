"use server"

import { revalidatePath } from "next/cache";
import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { checkUser } from "@/lib/checkUser";
import { assertInitialRoleAssignment, persistInitialRoleAssignment, ROLE_ALREADY_ASSIGNED } from "@/lib/onboarding-role-assignment.mjs";
import { validateInitialDoctorProfile } from "@/lib/doctor-onboarding-validation.mjs";


export async function setUserRole (formData){
    const {userId} =await auth();
    
    if(!userId){
        throw new Error ("Unauthorized");
    }
// Find or create User in our Database
const user = await checkUser();
const role = formData.get("role");
assertInitialRoleAssignment({ userId, user, role });
    try {
        if(role==="PATIENT"){
            await persistInitialRoleAssignment({
              userId,
              data: { role: "PATIENT" },
              updateUser: (args) => db.user.updateMany(args),
            });

      revalidatePath("/");
      return { success: true, redirect: "/doctors" };
    
        }
          // For doctor role - need additional information
    if (role === "DOCTOR") {
      const profile = validateInitialDoctorProfile(formData);

        await persistInitialRoleAssignment({
          userId,
          data: {
          role: "DOCTOR",
          ...profile,
          verificationStatus: "PENDING",
        },
          updateUser: (args) => db.user.updateMany(args),
        });

        revalidatePath("/");
      return { success: true, redirect: "/doctor/verification" };
    }
    } catch (error) {
      console.error("Failed to set user role:", error);
      if (error instanceof Error && error.message === ROLE_ALREADY_ASSIGNED) throw error;
      throw new Error("Failed to update user profile. Please try again.");
    }
}

/** Resubmit an existing rejected doctor's profile without changing their role. */
export async function resubmitDoctorProfile(formData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const user = await db.user.findUnique({ where: { clerkUserId: userId, role: "DOCTOR" } });
  if (!user || user.verificationStatus !== "REJECTED") throw new Error("Only rejected doctor profiles can be resubmitted");
  const specialty = formData.get("specialty")?.toString().trim();
  const experienceValue = formData.get("experience")?.toString().trim();
  const experience = Number(experienceValue);
  const credentialUrl = formData.get("credentialUrl")?.toString().trim();
  const description = formData.get("description")?.toString().trim();
  const city = formData.get("city")?.toString().trim();
  const state = formData.get("state")?.toString().trim();
  const country = formData.get("country")?.toString().trim();
  if (!specialty || !experienceValue || !Number.isInteger(experience) || experience < 0 || experience > 80 || !credentialUrl || !description || !city || !state || !country) throw new Error("Complete all professional and location fields before resubmitting");
  let credential;
  try { credential = new URL(credentialUrl); } catch { throw new Error("Enter a valid credential URL"); }
  if (!["https:", "http:"].includes(credential.protocol)) throw new Error("Enter a valid credential URL");
  await db.user.update({ where: { id: user.id, verificationStatus: "REJECTED" }, data: { specialty, experience, credentialUrl, description, city, state, country, verificationStatus: "PENDING" } });
  revalidatePath("/doctor/verification");
  revalidatePath("/admin");
  return { success: true, redirect: "/doctor/verification" };
}
/*Gets the current user's complete profile information
 */
export async function getCurrentUser() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  try {
    const user = await db.user.findUnique({
      where: {
        clerkUserId: userId,
      },
    });

    return user;
  } catch (error) {
    console.error("Failed to get user information:", error);
    throw new Error("Unable to load your account right now. Please try again later.");
  }
}
