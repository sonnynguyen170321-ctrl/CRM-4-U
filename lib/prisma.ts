import { PrismaClient } from '@prisma/client';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { auditExtension } from './audit';
import { tenantStorage } from './tenant-context';
export { tenantStorage };

// Route non-transactional pool queries over HTTP — no TCP handshake on cold start.
// PrismaNeon (Pool-based) is used instead of PrismaNeonHTTP because the RLS middleware
// relies on $transaction([set_config, set_config, query]), which HTTP-only mode cannot support.
neonConfig.poolQueryViaFetch = true;

const globalForPrisma = globalThis as unknown as { prisma: any };

async function getTenantIdFromSession(): Promise<string | null> {
  try {
    // Run the auth() call in a context where RLS is bypassed to prevent recursive DB calls
    return await tenantStorage.run({ tenantId: 'default-tenant', bypassRls: true }, async () => {
      const { auth } = await import('@/auth');
      const session = await auth();
      return (session?.user as any)?.tenantId || null;
    });
  } catch {
    // Fail silently when cookies/headers are not available (e.g. outside request context)
    return null;
  }
}

function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });

  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  return client.$extends(auditExtension).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: { model?: string; operation: string; args: any; query: (args: any) => Promise<any> }) {
          if (!model) {
            return query(args);
          }

          // 1. Resolve tenant context
          const store = tenantStorage.getStore();
          let tenantId: string | null | undefined = store?.tenantId;
          let bypassRls = store?.bypassRls;

          if (!store) {
            tenantId = await getTenantIdFromSession();
          }

          const isLocalOrScript =
            process.env.NODE_ENV !== 'production' || process.env.BYPASS_RLS === 'true';

          if (!tenantId && isLocalOrScript) {
            bypassRls = true;
          }

          // 2. If bypassing RLS, run the query directly with bypass flag set in session
          if (bypassRls || !tenantId) {
            if (!tenantId && !isLocalOrScript) {
              // Secure by default: return empty/error in production if no context is found
              if (operation.startsWith('find') || operation.startsWith('get')) {
                return operation.endsWith('Many') ? [] : null;
              }
              throw new Error(`Unauthorized: No tenant context active for operation ${operation} on model ${model}`);
            }

            const [, result] = await client.$transaction([
              client.$executeRaw`SELECT set_config('app.bypass_rls', 'true', true)`,
              query(args),
            ] as any);
            return result;
          }

          // 3. Inject tenantId filter to query arguments (Primary isolation layer for superusers)
          if (operation.startsWith('find') || operation === 'count' || operation === 'aggregate' || operation === 'groupBy') {
            args.where = {
              ...args.where,
              tenantId,
            };
          } else if (operation === 'create') {
            args.data = {
              ...args.data,
              tenantId,
            };
          } else if (operation === 'update' || operation === 'upsert') {
            args.where = {
              ...args.where,
              tenantId,
            };
            if (args.data) {
              args.data = {
                ...args.data,
                tenantId,
              };
            }
          } else if (operation === 'delete' || operation === 'deleteMany') {
            args.where = {
              ...args.where,
              tenantId,
            };
          } else if (operation === 'updateMany') {
            args.where = {
              ...args.where,
              tenantId,
            };
            if (args.data) {
              args.data = {
                ...args.data,
                tenantId,
              };
            }
          }

          // 4. Run inside database transaction setting the RLS parameters (Secondary isolation layer)
          const [, , result] = await client.$transaction([
            client.$executeRaw`SELECT set_config('app.bypass_rls', 'false', true)`,
            client.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`,
            query(args),
          ] as any);
          return result;
        },
      },
    },
  });
}

// Reuse across hot-reloads in development to avoid exhausting connections.
export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

