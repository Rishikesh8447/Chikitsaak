import { PrismaClient } from "@prisma/client";

function getClientOptions() {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    let modified = false;

    // Neon compute cold-starts can take 3-6s. Ensure Prisma allows 15s to establish connection.
    const connectTimeout = parseInt(parsed.searchParams.get("connect_timeout") || "0", 10);
    if (!parsed.searchParams.has("connect_timeout") || connectTimeout < 15) {
      parsed.searchParams.set("connect_timeout", "15");
      modified = true;
    }

    const poolTimeout = parseInt(parsed.searchParams.get("pool_timeout") || "0", 10);
    if (!parsed.searchParams.has("pool_timeout") || poolTimeout < 15) {
      parsed.searchParams.set("pool_timeout", "15");
      modified = true;
    }

    if (modified) {
      return {
        datasources: {
          db: {
            url: parsed.toString(),
          },
        },
      };
    }
  } catch {
    // If DATABASE_URL is not a standard URL, fallback to default Prisma instantiation
  }

  return undefined;
}

const clientOptions = getClientOptions();

export const db = globalThis.prisma || (clientOptions ? new PrismaClient(clientOptions) : new PrismaClient());


if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = db;
}
// globalThis.prisma: This global variable ensures that the Prisma client instance is
// reused across hot reloads during development. Without this, each time your application
// reloads, a new instance of the Prisma client would be created, potentially leading
// to connection issues.