/**
 * In-memory sliding-window rate limiter for OpenAI clinical assistance endpoints.
 *
 * NOTE (Serverless Limitation):
 * State is maintained in-memory per warm Node.js process / serverless instance.
 * It does not synchronize state across horizontally distributed Vercel instances,
 * but effectively prevents rapid burst loops and automated invocation abuse within
 * active instances without requiring external database or Redis infrastructure.
 */

export const RATE_LIMIT_MESSAGE = "Too many AI requests. Please wait a minute before trying again.";

export const AI_RATE_LIMITS = {
  PATIENT_SUMMARY: {
    limit: 5,
    windowMs: 60 * 1000,
  },
  DOCTOR_DRAFT: {
    limit: 10,
    windowMs: 60 * 1000,
  },
};

const stores = {
  PATIENT_SUMMARY: new Map(),
  DOCTOR_DRAFT: new Map(),
};

/**
 * Prunes expired timestamps and removes inactive users from memory.
 */
function pruneStore(store, windowMs, now) {
  for (const [userId, timestamps] of store.entries()) {
    const valid = timestamps.filter((t) => now - t < windowMs);
    if (valid.length === 0) {
      store.delete(userId);
    } else if (valid.length !== timestamps.length) {
      store.set(userId, valid);
    }
  }
}

/**
 * Checks whether an action by the authenticated database userId is within the allowed sliding window.
 * If permitted, records the timestamp and returns true.
 * If the rate limit is exceeded, returns false without modifying timestamps.
 *
 * @param {"PATIENT_SUMMARY" | "DOCTOR_DRAFT"} actionType
 * @param {string} userId - Authenticated database user ID
 * @param {number} [now] - Current timestamp (defaults to Date.now())
 * @returns {boolean}
 */
export function checkAiRateLimit(actionType, userId, now = Date.now()) {
  const config = AI_RATE_LIMITS[actionType];
  if (!config || typeof userId !== "string" || !userId) {
    return true;
  }

  const store = stores[actionType];
  const { limit, windowMs } = config;

  // Sweep inactive keys when the map reaches a reasonable size to prevent unbounded memory growth
  if (store.size > 100) {
    pruneStore(store, windowMs, now);
  }

  const existing = store.get(userId) || [];
  const valid = existing.filter((t) => now - t < windowMs);

  if (valid.length >= limit) {
    if (valid.length !== existing.length) {
      store.set(userId, valid);
    }
    return false;
  }

  valid.push(now);
  store.set(userId, valid);
  return true;
}

/**
 * Resets all in-memory rate limit stores. Useful for deterministic testing.
 */
export function resetAiRateLimits() {
  stores.PATIENT_SUMMARY.clear();
  stores.DOCTOR_DRAFT.clear();
}

