/**
 * Safe avatar image validation and domain allowlist for Clerk and OAuth profile images.
 * Prevents next/image runtime crashes on unconfigured or invalid remote image URLs.
 */

export const ALLOWED_AVATAR_HOSTNAMES = new Set([
  "img.clerk.com",
  "images.clerk.dev",
  "lh3.googleusercontent.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
  "avatars.githubusercontent.com",
]);

/**
 * Checks whether an image URL is safe to pass to next/image.
 * Allows local absolute paths (starting with '/') and HTTPS URLs from allowed hostnames.
 *
 * @param {unknown} url
 * @returns {boolean}
 */
export function isAllowedAvatarUrl(url) {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || /^(null|undefined)$/i.test(trimmed)) return false;

  // Local relative static assets (e.g. '/banner2.png')
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    return ALLOWED_AVATAR_HOSTNAMES.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Returns the trimmed image URL if allowed, or null if missing, invalid, or unsupported.
 *
 * @param {unknown} url
 * @returns {string | null}
 */
export function getSafeAvatarUrl(url) {
  if (!isAllowedAvatarUrl(url)) return null;
  return url.trim();
}

