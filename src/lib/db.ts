import { PrismaClient } from '@prisma/client'

// Fail fast on startup if the database is not configured — a missing or
// misrouted DATABASE_URL must never surface as confusing per-request errors.
if (!process.env.DATABASE_URL || !/^file:/.test(process.env.DATABASE_URL.trim())) {
  throw new Error(
    'DATABASE_URL is missing or invalid. Expected a Prisma "file:" connection string (e.g. file:./custom.db).'
  )
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient(
    // Verbose query logging is a development aid only — in production it
    // bloats stdout logs, leaks query data into logs and adds memory churn.
    process.env.NODE_ENV === 'production' ? { log: [] } : { log: ['query'] }
  )

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db