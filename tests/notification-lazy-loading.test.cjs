const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const actionSourcePromise = readFile(join(cwd(), "actions", "notifications.js"), "utf8");
const componentSourcePromise = readFile(join(cwd(), "components", "notification-center.jsx"), "utf8");

async function loadNotificationActions({ clerkUserId = "clerk-user-1", existingUser = true } = {}) {
  const source = await actionSourcePromise;
  const state = {
    notifications: [
      { id: "notif-1", userId: "db-user-1", title: "Appt 1", message: "Confirmed", readAt: null, createdAt: new Date() },
      { id: "notif-2", userId: "db-user-1", title: "Appt 2", message: "Reminder", readAt: new Date(), createdAt: new Date() },
      { id: "notif-3", userId: "db-user-2", title: "Appt 3", message: "Other user", readAt: null, createdAt: new Date() },
    ],
    findManyCalls: [],
    countCalls: [],
    updateManyCalls: [],
  };

  const dependencies = {
    auth: async () => ({ userId: clerkUserId }),
    revalidatePath: () => {},
    measureServerTiming: async (_label, cb) => cb(),
    db: {
      user: {
        findUnique: async ({ where }) =>
          existingUser && where.clerkUserId === clerkUserId ? { id: "db-user-1" } : null,
      },
      notification: {
        findMany: async (args) => {
          state.findManyCalls.push(args);
          return state.notifications.filter((n) => n.userId === args.where.userId);
        },
        count: async (args) => {
          state.countCalls.push(args);
          return state.notifications.filter(
            (n) => n.userId === args.where.userId && (!Object.hasOwn(args.where, "readAt") || n.readAt === args.where.readAt)
          ).length;
        },
        updateMany: async (args) => {
          state.updateManyCalls.push(args);
          const matched = state.notifications.filter(
            (n) => n.userId === args.where.userId &&
              (!args.where.id || n.id === args.where.id) &&
              (!Object.hasOwn(args.where, "readAt") || n.readAt === args.where.readAt)
          );
          for (const item of matched) {
            item.readAt = args.data.readAt;
          }
          return { count: matched.length };
        },
      },
    },
  };

  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { measureServerTiming } from "@/lib/server-timing.mjs";', "const { measureServerTiming } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { getUnreadNotificationCount, getMyNotifications, markNotificationRead, markAllNotificationsRead };");

  return { ...new Function("dependencies", transformed)(dependencies), state };
}

test("getUnreadNotificationCount executes count query only, skipping findMany", async () => {
  const { getUnreadNotificationCount, state } = await loadNotificationActions();
  const result = await getUnreadNotificationCount();

  assert.equal(result.unreadCount, 1);
  assert.equal(state.countCalls.length, 1);
  assert.deepEqual(state.countCalls[0].where, { userId: "db-user-1", readAt: null });
  assert.equal(state.findManyCalls.length, 0, "findMany must not be executed when checking unread count");
});

test("getUnreadNotificationCount enforces authentication", async () => {
  const { getUnreadNotificationCount, state } = await loadNotificationActions({ clerkUserId: null });
  await assert.rejects(getUnreadNotificationCount(), /Unauthorized/);
  assert.equal(state.countCalls.length, 0);
});

test("getMyNotifications executes both list and count queries", async () => {
  const { getMyNotifications, state } = await loadNotificationActions();
  const result = await getMyNotifications();

  assert.equal(result.notifications.length, 2);
  assert.equal(result.unreadCount, 1);
  assert.equal(state.findManyCalls.length, 1);
  assert.equal(state.countCalls.length, 1);
  assert.equal(state.findManyCalls[0].where.userId, "db-user-1");
});

test("markNotificationRead updates readAt and markAllNotificationsRead updates all unread", async () => {
  const { markNotificationRead, markAllNotificationsRead, state } = await loadNotificationActions();

  const res1 = await markNotificationRead("notif-1");
  assert.equal(res1.success, true);
  assert.ok(state.notifications[0].readAt instanceof Date);

  // Add another unread notification
  state.notifications.push({ id: "notif-4", userId: "db-user-1", readAt: null });
  const res2 = await markAllNotificationsRead();
  assert.equal(res2.success, true);
  assert.ok(state.notifications[3].readAt instanceof Date);
});

test("NotificationCenter component implements lazy loading contracts", async () => {
  const componentSource = await componentSourcePromise;

  // 1. Initial mount fetches only unread count, not full notification list
  assert.match(componentSource, /getUnreadNotificationCount/);
  assert.match(componentSource, /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?getUnreadNotificationCount\(\)/);

  // 2. Full notification list is fetched only when opening dropdown
  assert.match(componentSource, /hasLoadedList/);
  assert.match(componentSource, /listLoading/);
  assert.match(componentSource, /toggleOpen/);
  assert.match(componentSource, /if\s*\(willOpen\s*&&\s*!hasLoadedList\s*&&\s*!listLoading\)\s*\{\s*fetchList\(\);?\s*\}/);

  // 3. Mark all read and mark read refresh list
  assert.match(componentSource, /await\s+markNotificationRead\(id\);[\s\S]*?await\s+fetchList\(\);/);
  assert.match(componentSource, /await\s+markAllNotificationsRead\(\);[\s\S]*?await\s+fetchList\(\);/);

  // 4. Accessible badge and loading state
  assert.match(componentSource, /unreadCount > 0 && <span[\s\S]*?\{unreadCount > 9 \? "9\+" : unreadCount\}<\/span>/);
  assert.match(componentSource, /listLoading \? <p[^>]*>[\s\S]*?Loading notifications/);

  // 5. Server-seeded initialUnreadCount skips redundant mount-time server action call
  assert.match(componentSource, /function NotificationCenter\(\{\s*initialUnreadCount\s*\}\s*=\s*\{\}\)/);
  assert.match(componentSource, /if\s*\(typeof initialUnreadCount === "number"\)\s*\{\s*setUnreadCount\(initialUnreadCount\);\s*return;\s*\}/);

  const headerSource = await readFile(join(cwd(), "components", "header.jsx"), "utf8");
  assert.match(headerSource, /<NotificationCenter\s+initialUnreadCount=\{initialUnreadCount\}\s*\/>/);
  assert.match(headerSource, /db\.notification\.count\(\{\s*where:\s*\{\s*userId:\s*user\.id,\s*readAt:\s*null\s*\}\s*\}\)/);
});

