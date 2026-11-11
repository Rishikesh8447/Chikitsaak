import { PrismaClient } from "@prisma/client";

export function getClientOptions(url = process.env.DATABASE_URL) {
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

    // Neon -pooler endpoints use PgBouncer in transaction mode; ensure pgbouncer=true when missing
    // so Prisma uses unnamed prepared statements.
    if (parsed.hostname.toLowerCase().includes("-pooler") && !parsed.searchParams.has("pgbouncer")) {
      parsed.searchParams.set("pgbouncer", "true");
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

globalThis.prisma = db;
// globalThis.prisma: Ensures the Prisma client instance is reused across hot reloads
// during development and across warm container invocations in production. Without this,
// repeated instantiations can exhaust database connections.