"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { measureServerTiming } from "@/lib/server-timing.mjs";

const userCache = new Map();
const unreadCountCache = new Map();
const UNREAD_COUNT_TTL_MS = 15_000;
const MAX_CACHE_ENTRIES = 500;

function setBoundedCache(map, key, value) {
  if (map.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(key, value);
}

async function currentDatabaseUser() {
  const { userId } = await measureServerTiming("notifications.auth", () => auth());
  if (!userId) throw new Error("Unauthorized");
  const cachedUser = userCache.get(userId);
  if (cachedUser) return cachedUser;
  const user = await measureServerTiming("notifications.userLookup", () =>
    db.user.findUnique({ where: { clerkUserId: userId }, select: { id: true } })
  );
  if (!user) throw new Error("User not found");
  setBoundedCache(userCache, userId, user);
  return user;
}

export async function getUnreadNotificationCount() {
  const user = await currentDatabaseUser();
  const cached = unreadCountCache.get(user.id);
  if (cached && Date.now() < cached.expiresAt) {
    return { unreadCount: cached.unreadCount };
  }
  const unreadCount = await measureServerTiming("notifications.unreadCountQuery", () =>
    db.notification.count({ where: { userId: user.id, readAt: null } })
  );
  setBoundedCache(unreadCountCache, user.id, { unreadCount, expiresAt: Date.now() + UNREAD_COUNT_TTL_MS });
  return { unreadCount };
}

export async function getMyNotifications() {
  const user = await currentDatabaseUser();
  const where = { userId: user.id };
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
  unreadCountCache.set(user.id, { unreadCount, expiresAt: Date.now() + UNREAD_COUNT_TTL_MS });
  return { notifications, unreadCount };
}

export async function markNotificationRead(notificationId) {
  const user = await currentDatabaseUser();
  if (typeof notificationId !== "string") throw new Error("Invalid notification");
  const changed = await db.notification.updateMany({ where: { id: notificationId, userId: user.id }, data: { readAt: new Date() } });
  if (changed.count !== 1) throw new Error("Notification not found");
  unreadCountCache.delete(user.id);
  revalidatePath("/");
  return { success: true };
}

export async function markAllNotificationsRead() {
  const user = await currentDatabaseUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  unreadCountCache.delete(user.id);
  revalidatePath("/");
  return { success: true };
}
