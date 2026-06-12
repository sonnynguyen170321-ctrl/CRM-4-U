import { PrismaNeonHttp } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import { auditExtension } from './audit';

// PrismaNeonHttp uses Neon's HTTP transport instead of a persistent TCP connection.
// This eliminates the TCP handshake + PG auth overhead on every Vercel cold invocation,
// making serverless DB calls noticeably faster without any WebSocket setup.

const globalForPrisma = globalThis as unknown as { prisma: any };

function createPrismaClient() {
  const adapter = new PrismaNeonHttp(process.env.DATABASE_URL!, {});
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
  return client.$extends(auditExtension) as any;
}

// Reuse across hot-reloads in development to avoid exhausting connections.
export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
