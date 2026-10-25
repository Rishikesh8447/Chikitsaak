/** Log development-only server timing without request, user, or query data. */
export async function measureServerTiming(label, operation) {
  if (process.env.NODE_ENV !== "development") return operation();

  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    console.info(`[server-timing] ${label} ${(performance.now() - startedAt).toFixed(1)}ms`);
  }
}
