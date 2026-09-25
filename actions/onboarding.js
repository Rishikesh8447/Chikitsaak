"use server"

import { revalidatePath } from "next/cache";
import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { checkUser } from "@/lib/checkUser";


export async function setUserRole (formData){
    const {userId} =await auth();
    
    if(!userId){
        throw new Error ("Unauthorized");
    }
// Find or create User in our Database
const user = await checkUser();
if(!user || user.clerkUserId !== userId) throw new Error ("User not found in database");

const role = formData.get("role");

 if (!role || !["PATIENT", "DOCTOR"].includes(role)) {
    throw new Error("Invalid role selection");}
    try {
        if(role==="PATIENT"){
            await db.user.update({
        where: {
          clerkUserId: userId,
        },
        data: {
          role: "PATIENT",
        },
      });

      revalidatePath("/");
      return { success: true, redirect: "/doctors" };
    
        }
          // For doctor role - need additional information
    if (role === "DOCTOR") {
      const specialty = formData.get("specialty");
      const experience = parseInt(formData.get("experience"), 10);
      const credentialUrl = formData.get("credentialUrl");
      const description = formData.get("description");
      const city = formData.get("city")?.toString().trim();
      const state = formData.get("state")?.toString().trim();
      const country = formData.get("country")?.toString().trim();

  // Validate inputs
      if (!specialty || !experience || !credentialUrl || !description || !city || !state || !country) {
        throw new Error("All professional and location fields are required");
      }

        await db.user.update({
        where: {
          clerkUserId: userId,
        },
        data: {
          role: "DOCTOR",
          specialty,
          experience,
          credentialUrl,
          description,
          city,
          state,
          country,
          verificationStatus: "PENDING",
        },
      });

        revalidatePath("/");
      return { success: true, redirect: "/doctor/verification" };
    }
    } catch (error) {
      console.error("Failed to set user role:", error);
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
