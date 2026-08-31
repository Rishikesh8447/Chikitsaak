import { clerkClient } from "@clerk/nextjs/server";

export function isInvalidDoctorName(value) {
  if (typeof value !== "string" || !value.trim()) {
    return true;
  }

  return /^(null|undefined)(\s+(null|undefined))?$/i.test(
    value.trim()
  );
}

function getClerkName(user) {
  const firstName =
    typeof user?.firstName === "string" &&
    !/^(null|undefined)$/i.test(user.firstName.trim())
      ? user.firstName.trim()
      : "";

  const lastName =
    typeof user?.lastName === "string" &&
    !/^(null|undefined)$/i.test(user.lastName.trim())
      ? user.lastName.trim()
      : "";

  const fullName = `${firstName} ${lastName}`.trim();

  if (fullName) {
    return fullName;
  }

  if (
    typeof user?.username === "string" &&
    user.username.trim() &&
    !/^(null|undefined)$/i.test(user.username.trim())
  ) {
    return user.username.trim();
  }

  const email =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress;

  if (typeof email === "string" && email.includes("@")) {
    return email.split("@")[0];
  }

  return null;
}

export async function resolveDoctorPublicNames(doctors) {
  const invalidDoctors = doctors.filter(
    (doctor) =>
      isInvalidDoctorName(doctor.name) &&
      doctor.clerkUserId
  );

  if (!invalidDoctors.length) {
    return doctors.map(({ clerkUserId, ...doctor }) => doctor);
  }

  try {
    const client = await clerkClient();

    const resolved = await Promise.all(
      invalidDoctors.map(async (doctor) => {
        try {
          const user = await client.users.getUser(
            doctor.clerkUserId
          );

          return [doctor.id, getClerkName(user)];
        } catch (error) {
          console.error(
            `Failed to resolve Clerk user ${doctor.clerkUserId}:`,
            error
          );

          return [doctor.id, null];
        }
      })
    );

    const names = new Map(resolved);

    return doctors.map((doctor) => {
      const resolvedName = names.get(doctor.id);

      const { clerkUserId, ...publicDoctor } = doctor;

      if (resolvedName) {
        return {
          ...publicDoctor,
          name: resolvedName,
        };
      }

      return {
        ...publicDoctor,
        name: "Doctor",
      };
    });
  } catch (error) {
    console.error("Failed to resolve doctor names:", error);

    return doctors.map(({ clerkUserId, ...doctor }) => ({
      ...doctor,
      name: isInvalidDoctorName(doctor.name)
        ? "Doctor"
        : doctor.name,
    }));
  }
}