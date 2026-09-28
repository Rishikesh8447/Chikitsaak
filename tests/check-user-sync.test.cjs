const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const sourcePromise = readFile(join(cwd(), "lib", "checkUser.js"), "utf8");

async function loadCheckUser({ clerkUser, existingUser }) {
  const source = await sourcePromise;
  const state = { updates: [], creates: [], lookups: [] };
  const db = { user: {
    findUnique: async (args) => { state.lookups.push(args); return existingUser; },
    update: async (args) => { state.updates.push(args); return { ...existingUser, ...args.data }; },
    create: async (args) => { state.creates.push(args); return args.data; },
  } };
  const transformed = source
    .replace('import { currentUser } from "@clerk/nextjs/server";', "const { currentUser } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace("export const checkUser = async () =>", "const checkUser = async () =>")
    .concat("\nreturn { checkUser };");
  const checkUser = new Function("dependencies", transformed)({
    currentUser: async () => clerkUser,
    db,
  }).checkUser;
  return { checkUser, state };
}

const clerkUser = (email, { name = "Sam Patient", imageUrl = "https://example.test/avatar.png" } = {}) => ({
  id: "clerk-user-1",
  firstName: name.split(" ")[0],
  lastName: name.split(" ")[1],
  imageUrl,
  primaryEmailAddressId: "email-1",
  emailAddresses: [{ id: "email-1", emailAddress: email }],
});

test("existing Clerk user email changes sync even when name and image are unchanged", async () => {
  const existingUser = { clerkUserId: "clerk-user-1", name: "Sam Patient", email: "old@example.test", imageUrl: "https://example.test/avatar.png" };
  const { checkUser, state } = await loadCheckUser({ clerkUser: clerkUser("new@example.test"), existingUser });
  const result = await checkUser();
  assert.equal(result.email, "new@example.test");
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].data.email, "new@example.test");
});

test("missing Clerk email prevents local-user creation", async () => {
  const { checkUser, state } = await loadCheckUser({ clerkUser: { id: "clerk-user-1", emailAddresses: [] }, existingUser: null });
  assert.equal(await checkUser(), null);
  assert.equal(state.creates.length, 0);
});
