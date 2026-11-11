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

const CLERK_BATCH_SIZE = 100;

async function fetchClerkUsersById(client, clerkUserIds) {
  const usersById = new Map();
  const uniqueIds = [...new Set(clerkUserIds.filter(Boolean))];

  if (!uniqueIds.length) {
    return usersById;
  }

  if (typeof client?.users?.getUserList === "function") {
    for (let i = 0; i < uniqueIds.length; i += CLERK_BATCH_SIZE) {
      const chunk = uniqueIds.slice(i, i + CLERK_BATCH_SIZE);
      try {
        const response = await client.users.getUserList({
          userId: chunk,
          limit: chunk.length,
        });
        const users = Array.isArray(response) ? response : response?.data || [];
        for (const user of users) {
          if (user?.id) {
            usersById.set(user.id, user);
          }
        }
      } catch (error) {
        console.error("Failed to batch resolve Clerk users:", error);
      }
    }
    return usersById;
  }

  if (typeof client?.users?.getUser === "function") {
    await Promise.all(
      uniqueIds.map(async (clerkUserId) => {
        try {
          const user = await client.users.getUser(clerkUserId);
          if (user) {
            usersById.set(clerkUserId, user);
          }
        } catch (error) {
          console.error(
            `Failed to resolve Clerk user ${clerkUserId}:`,
            error
          );
        }
      })
    );
  }

  return usersById;
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
    const usersById = await fetchClerkUsersById(
      client,
      invalidDoctors.map((doctor) => doctor.clerkUserId)
    );

    return doctors.map((doctor) => {
      const { clerkUserId, ...publicDoctor } = doctor;

      if (!isInvalidDoctorName(doctor.name)) {
        return publicDoctor;
      }

      const resolvedName = clerkUserId
        ? getClerkName(usersById.get(clerkUserId))
        : null;

      return {
        ...publicDoctor,
        name: resolvedName || "Doctor",
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