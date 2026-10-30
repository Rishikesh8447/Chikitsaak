const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const avatarModulePromise = import("../lib/avatar-image.mjs");

test("ALLOWED_AVATAR_HOSTNAMES includes required Clerk, Google OAuth, and GitHub OAuth domains", async () => {
  const { ALLOWED_AVATAR_HOSTNAMES } = await avatarModulePromise;
  assert.ok(ALLOWED_AVATAR_HOSTNAMES.has("img.clerk.com"), "img.clerk.com must be allowed");
  assert.ok(ALLOWED_AVATAR_HOSTNAMES.has("images.clerk.dev"), "images.clerk.dev must be allowed");
  assert.ok(ALLOWED_AVATAR_HOSTNAMES.has("lh3.googleusercontent.com"), "lh3.googleusercontent.com must be allowed for Google OAuth");
  assert.ok(ALLOWED_AVATAR_HOSTNAMES.has("avatars.githubusercontent.com"), "avatars.githubusercontent.com must be allowed for GitHub OAuth");
});

test("next.config.mjs defines restricted remotePatterns matching OAuth and Clerk providers without broad wildcards", async () => {
  const nextConfigPath = path.resolve(__dirname, "../next.config.mjs");
  const configContent = fs.readFileSync(nextConfigPath, "utf8");

  assert.match(configContent, /hostname:\s*"img\.clerk\.com"/);
  assert.match(configContent, /hostname:\s*"images\.clerk\.dev"/);
  assert.match(configContent, /hostname:\s*"lh3\.googleusercontent\.com"/);
  assert.match(configContent, /hostname:\s*"avatars\.githubusercontent\.com"/);

  // Ensure no broad wildcards are permitted in hostnames
  assert.doesNotMatch(configContent, /hostname:\s*"\*"/);
  assert.doesNotMatch(configContent, /hostname:\s*"\*\.[a-z]+"/);
});

test("isAllowedAvatarUrl validates legitimate Clerk, Google, and GitHub URLs", async () => {
  const { isAllowedAvatarUrl } = await avatarModulePromise;

  assert.equal(isAllowedAvatarUrl("https://img.clerk.com/eyJhbGciOiJ..."), true);
  assert.equal(isAllowedAvatarUrl("https://images.clerk.dev/oauth_google/img.png"), true);
  assert.equal(isAllowedAvatarUrl("https://lh3.googleusercontent.com/a/ACg8ocI6example"), true);
  assert.equal(isAllowedAvatarUrl("https://lh4.googleusercontent.com/a/ACg8ocI6example"), true);
  assert.equal(isAllowedAvatarUrl("https://avatars.githubusercontent.com/u/14985020?v=4"), true);
  assert.equal(isAllowedAvatarUrl("/chikitsaak-full-logo.png"), true);
});

test("isAllowedAvatarUrl rejects untrusted hosts, malformed values, and non-HTTPS protocols", async () => {
  const { isAllowedAvatarUrl } = await avatarModulePromise;

  assert.equal(isAllowedAvatarUrl("https://attacker.example.com/malicious.jpg"), false);
  assert.equal(isAllowedAvatarUrl("https://random-image-host.net/pic.png"), false);
  assert.equal(isAllowedAvatarUrl("javascript:alert(1)"), false);
  assert.equal(isAllowedAvatarUrl(""), false);
  assert.equal(isAllowedAvatarUrl("   "), false);
  assert.equal(isAllowedAvatarUrl("null"), false);
  assert.equal(isAllowedAvatarUrl("undefined"), false);
  assert.equal(isAllowedAvatarUrl(null), false);
  assert.equal(isAllowedAvatarUrl(undefined), false);
  assert.equal(isAllowedAvatarUrl(12345), false);
  assert.equal(isAllowedAvatarUrl({}), false);
});

test("getSafeAvatarUrl safely normalizes URLs and returns null for invalid inputs to trigger icon fallback", async () => {
  const { getSafeAvatarUrl } = await avatarModulePromise;

  const googleUrl = "  https://lh3.googleusercontent.com/a/ACg8ocI6user  ";
  assert.equal(getSafeAvatarUrl(googleUrl), "https://lh3.googleusercontent.com/a/ACg8ocI6user");

  const githubUrl = "https://avatars.githubusercontent.com/u/12345";
  assert.equal(getSafeAvatarUrl(githubUrl), githubUrl);

  assert.equal(getSafeAvatarUrl("https://untrusted.com/photo.png"), null);
  assert.equal(getSafeAvatarUrl(""), null);
  assert.equal(getSafeAvatarUrl(null), null);
  assert.equal(getSafeAvatarUrl(undefined), null);
  assert.equal(getSafeAvatarUrl("null"), null);
});

