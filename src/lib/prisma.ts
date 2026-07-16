import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Soft-recover from dropped Postgres connections (common with Supabase idle timeouts). */
export async function withPrismaRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transient =
        /Closed|Connection|Can't reach|P1001|P1017|ECONNRESET|ETIMEDOUT/i.test(message);
      if (!transient || i === attempts - 1) throw error;
      try {
        await prisma.$disconnect();
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw lastError;
}
