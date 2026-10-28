import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/prisma";
import { measureServerTiming } from "@/lib/server-timing.mjs";

function getSafeName(user, email) {
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

  if (fullName) return fullName;

  if (
    typeof user?.username === "string" &&
    user.username.trim() &&
    !/^(null|undefined)$/i.test(user.username.trim())
  ) {
    return user.username.trim();
  }

  return email.split("@")[0];
}

export const checkUser = async () => {
  const user = await measureServerTiming("layout.clerkCurrentUser", () => currentUser());

  if (!user) return null;

  const email =
    user.emailAddresses?.find(
      (item) => item.id === user.primaryEmailAddressId
    )?.emailAddress ||
    user.emailAddresses?.[0]?.emailAddress;

  if (!email) return null;

  const name = getSafeName(user, email);
  const accountSelect = {
    id: true,
    clerkUserId: true,
    name: true,
    imageUrl: true,
    email: true,
    role: true,
    laboratoryMemberships: {
      where: { status: "ACTIVE" },
      take: 1,
      select: { id: true },
    },
    pharmacyMemberships: {
      where: { status: "ACTIVE" },
      take: 1,
      select: { id: true },
    },
  };

  try {
    const existing = await measureServerTiming("layout.databaseUserLookup", () => db.user.findUnique({
      where: {
        clerkUserId: user.id,
      },
      select: accountSelect,
    }));

    // User already exists.
    // Update broken/stale profile information instead of
    // blindly returning the old database record.
    if (existing) {
      const shouldUpdateName =
        !existing.name ||
        /^(null|undefined)(\s+(null|undefined))?$/i.test(
          existing.name.trim()
        );

      if (shouldUpdateName || existing.imageUrl !== user.imageUrl || existing.email !== email) {
        return await db.user.update({
          where: {
            clerkUserId: user.id,
          },
          data: {
            ...(shouldUpdateName ? { name } : {}),
            imageUrl: user.imageUrl,
            email,
          },
          select: accountSelect,
        });
      }

      return existing;
    }

    return await db.user.create({
      data: {
        clerkUserId: user.id,
        name,
        imageUrl: user.imageUrl,
        email,
      },
      select: accountSelect,
    });
  } catch (error) {
    if (error?.code === "P2002") {
      try {
        return await db.user.findUnique({
          where: {
            clerkUserId: user.id,
          },
          select: accountSelect,
        });
      } catch (retryError) {
        console.error("Failed to fetch existing user after P2002 conflict:", retryError?.message || retryError);
        return null;
      }
    }

    console.error("Failed to synchronize Clerk user:", error?.message || error);

    return null;
  }
};