import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { getConnection } from '@/lib/bullmq/connection';

const DIRECT_URL = process.env.DIRECT_URL || process.env.DATABASE_URL!;

const prisma = new PrismaClient({
  datasources: { db: { url: DIRECT_URL } },
});

export function createHealthcheckWorker(): Worker {
  const worker = new Worker(
    'maintenance',
    async (job) => {
      if (job.name !== 'maintenance.healthcheck') return;

      const startedAt = job.data.startedAt;
      const redisOk = await job.client?.ping().catch(() => null);

      let dbOk = false;
      try {
        await prisma.$queryRaw`SELECT 1`;
        dbOk = true;
      } catch {
        dbOk = false;
      }

      const elapsed = Date.now() - new Date(startedAt).getTime();

      await job.updateProgress({
        redis: redisOk === 'PONG' ? 'ok' : 'fail',
        database: dbOk ? 'ok' : 'fail',
        elapsedMs: elapsed,
      });

      console.log(`[worker:healthcheck] redis=${redisOk === 'PONG' ? 'OK' : 'FAIL'} db=${dbOk ? 'OK' : 'FAIL'} ${elapsed}ms`);
    },
    {
      connection: getConnection(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[worker:healthcheck] job ${job?.id} failed:`, err.message);
  });

  return worker;
}

export async function closeHealthcheck(): Promise<void> {
  await prisma.$disconnect();
}
