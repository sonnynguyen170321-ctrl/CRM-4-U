import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// On Neon (serverless PostgreSQL), each function invocation may open a new connection.
// DATABASE_URL should include ?pgbouncer=true&connection_limit=1 for pgBouncer mode,
// or use DIRECT_URL for migrations. See .env.local.example for the full template.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

// Reuse the client across hot-reloads in development to avoid exhausting connections.
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
