"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { measureServerTiming } from "@/lib/server-timing.mjs";

async function currentDatabaseUser() {
  const { userId } = await measureServerTiming("notifications.auth", () => auth());
  if (!userId) throw new Error("Unauthorized");
  const user = await measureServerTiming("notifications.userLookup", () =>
    db.user.findUnique({ where: { clerkUserId: userId }, select: { id: true } })
  );
  if (!user) throw new Error("User not found");
  return user;
}

export async function getMyNotifications() {
  const { userId } = await measureServerTiming("notifications.auth", () => auth());
  if (!userId) throw new Error("Unauthorized");
  const where = { user: { is: { clerkUserId: userId } } };
  const [notifications, unreadCount] = await Promise.all([
    measureServerTiming("notifications.listQuery", () =>
      db.notification.findMany({
        where,
        select: { id: true, title: true, message: true, createdAt: true, readAt: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    ),
    measureServerTiming("notifications.unreadCountQuery", () =>
      db.notification.count({ where: { ...where, readAt: null } })
    ),
  ]);
  return { notifications, unreadCount };
}

export async function markNotificationRead(notificationId) {
  const user = await currentDatabaseUser();
  if (typeof notificationId !== "string") throw new Error("Invalid notification");
  const changed = await db.notification.updateMany({ where: { id: notificationId, userId: user.id }, data: { readAt: new Date() } });
  if (changed.count !== 1) throw new Error("Notification not found");
  revalidatePath("/");
  return { success: true };
}

export async function markAllNotificationsRead() {
  const user = await currentDatabaseUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/");
  return { success: true };
}
