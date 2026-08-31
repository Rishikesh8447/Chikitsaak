"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function currentDatabaseUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const user = await db.user.findUnique({ where: { clerkUserId: userId }, select: { id: true } });
  if (!user) throw new Error("User not found");
  return user;
}

export async function getMyNotifications() {
  const user = await currentDatabaseUser();
  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return { notifications, unreadCount };
}

export async function markNotificationRead(notificationId) {
  const user = await currentDatabaseUser();
  if (typeof notificationId !== "string") throw new Error("Invalid notification");
  await db.notification.updateMany({ where: { id: notificationId, userId: user.id }, data: { readAt: new Date() } });
  revalidatePath("/");
  return { success: true };
}

export async function markAllNotificationsRead() {
  const user = await currentDatabaseUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/");
  return { success: true };
}
