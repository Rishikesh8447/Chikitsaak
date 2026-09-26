const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const sourcePromise = readFile(join(cwd(), "actions", "notifications.js"), "utf8");

async function loadActions({ clerkUserId = "clerk-a", existingUser = true } = {}) {
  const source = await sourcePromise;
  const state = {
    notifications: [
      { id: "notification-a", userId: "user-a", readAt: null },
      { id: "notification-b", userId: "user-b", readAt: null },
    ],
    queries: [],
    revalidated: [],
  };
  const dependencies = {
    auth: async () => ({ userId: clerkUserId }),
    revalidatePath: (path) => state.revalidated.push(path),
    db: {
      user: { findUnique: async ({ where }) => existingUser && where.clerkUserId === clerkUserId ? { id: "user-a" } : null },
      notification: {
        findMany: async (query) => {
          state.queries.push(query);
          return state.notifications.filter((item) => item.userId === query.where.userId);
        },
        count: async (query) => state.notifications.filter((item) => item.userId === query.where.userId && item.readAt === null).length,
        updateMany: async (query) => {
          state.queries.push(query);
          const rows = state.notifications.filter((item) => item.userId === query.where.userId
            && (!query.where.id || item.id === query.where.id)
            && (!Object.hasOwn(query.where, "readAt") || item.readAt === query.where.readAt));
          for (const row of rows) row.readAt = query.data.readAt;
          return { count: rows.length };
        },
      },
    },
  };
  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { getMyNotifications, markNotificationRead, markAllNotificationsRead };");
  return { ...new Function("dependencies", transformed)(dependencies), state };
}

test("unauthenticated notification reads are rejected", async () => {
  const { getMyNotifications, state } = await loadActions({ clerkUserId: null });
  await assert.rejects(getMyNotifications(), /Unauthorized/);
  assert.equal(state.queries.length, 0);
});

test("notification reads return only the current user's records and unread count", async () => {
  const { getMyNotifications, state } = await loadActions();
  const result = await getMyNotifications();
  assert.deepEqual(result.notifications.map((item) => item.id), ["notification-a"]);
  assert.equal(result.unreadCount, 1);
  assert.ok(state.queries.every((query) => query.where.userId === "user-a"));
});

test("a user can mark their own notification as read", async () => {
  const { markNotificationRead, state } = await loadActions();
  assert.deepEqual(await markNotificationRead("notification-a"), { success: true });
  assert.ok(state.notifications[0].readAt instanceof Date);
  assert.equal(state.notifications[1].readAt, null);
  assert.deepEqual(state.queries[0].where, { id: "notification-a", userId: "user-a" });
});

test("marking another user's notification as read is rejected", async () => {
  const { markNotificationRead, state } = await loadActions();
  await assert.rejects(markNotificationRead("notification-b"), /Notification not found/);
  assert.equal(state.notifications[1].readAt, null);
  assert.deepEqual(state.queries[0].where, { id: "notification-b", userId: "user-a" });
});

test("mark all read updates only the current user's unread notifications", async () => {
  const { markAllNotificationsRead, state } = await loadActions();
  assert.deepEqual(await markAllNotificationsRead(), { success: true });
  assert.ok(state.notifications[0].readAt instanceof Date);
  assert.equal(state.notifications[1].readAt, null);
  assert.deepEqual(state.queries[0].where, { userId: "user-a", readAt: null });
});
