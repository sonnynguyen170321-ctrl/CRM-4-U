import { vi, describe, it, expect, beforeEach } from 'vitest';
import { enqueue } from '@/lib/bullmq/enqueue';
import { wrapProcessor } from '@/lib/bullmq/workerUtils';
import { prisma } from '@/lib/prisma';
import { JobType } from '@/lib/bullmq/types';
import { tenantStorage } from '@/lib/tenant-context';

// Mock BullMQ Queue and Worker to avoid connecting to real Redis during tests
vi.mock('bullmq', async (importOriginal) => {
  const original = await importOriginal<typeof import('bullmq')>();
  return {
    ...original,
    Queue: class {
      name: string;
      constructor(name: string) {
        this.name = name;
      }
      async add(name: string, data: any, opts: any) {
        return { id: opts.jobId || 'mock-job-id', name, data, opts };
      }
      async close() {}
    },
    Worker: class {
      constructor() {}
      async close() {}
    },
  };
});

describe('BullMQ Foundation & JobRun Tracking', () => {
  const tenantId = 'default-tenant';

  beforeEach(async () => {
    // Clear JobRuns before each test under the default tenant context
    await tenantStorage.run({ tenantId, bypassRls: true }, async () => {
      await prisma.jobRun.deleteMany();
    });
  });

  it('should create a queued JobRun in database on enqueue', async () => {
    const payload = { startedAt: new Date().toISOString() };
    
    const jobId = await enqueue(JobType.MAINTENANCE_HEALTHCHECK, payload, { tenantId });
    
    // Check if JobRun was created
    const jobRun = await tenantStorage.run({ tenantId, bypassRls: true }, async () => {
      return prisma.jobRun.findUnique({ where: { id: jobId } });
    });

    expect(jobRun).toBeDefined();
    expect(jobRun?.status).toBe('queued');
    expect(jobRun?.jobName).toBe(JobType.MAINTENANCE_HEALTHCHECK);
    expect(jobRun?.bullJobId).toBe(jobId);
    expect(jobRun?.tenantId).toBe(tenantId);
  });

  it('should reuse and reset JobRun record for duplicate enqueue requests', async () => {
    const payload = { startedAt: new Date().toISOString() };
    
    // First enqueue
    const jobId1 = await enqueue(JobType.MAINTENANCE_HEALTHCHECK, payload, { tenantId });
    
    // Simulate job starting and finishing
    await tenantStorage.run({ tenantId, bypassRls: true }, async () => {
      await prisma.jobRun.update({
        where: { id: jobId1 },
        data: {
          status: 'completed',
          completedAt: new Date(),
          progress: { done: true }
        }
      });
    });

    // Enqueue identical job (triggers deduplication/upsert logic)
    const jobId2 = await enqueue(JobType.MAINTENANCE_HEALTHCHECK, payload, { tenantId });
    
    expect(jobId2).toBe(jobId1);

    const jobRun = await tenantStorage.run({ tenantId, bypassRls: true }, async () => {
      return prisma.jobRun.findUnique({ where: { id: jobId2 } });
    });

    // Check that status got reset to queued and execution stats cleared
    expect(jobRun?.status).toBe('queued');
    expect(jobRun?.completedAt).toBeNull();
    expect(jobRun?.progress).toBeNull();
  });

  it('should transition JobRun to active and completed with wrapProcessor', async () => {
    // 1. Create a queued JobRun
    const payload = { startedAt: new Date().toISOString() };
    const jobId = await enqueue(JobType.MAINTENANCE_HEALTHCHECK, payload, { tenantId });

    // 2. Wrap a processor that completes successfully
    const mockProcessor = wrapProcessor(async (job) => {
      // Mock progress update inside processor
      await job.updateProgress({ step: 'tested' });
      return { ok: true };
    });

    // Mock BullMQ Job object
    const mockJob: any = {
      id: jobId,
      attemptsMade: 1,
      client: null,
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    // 3. Run the wrapped processor
    const result = await mockProcessor(mockJob);
    expect(result).toEqual({ ok: true });

    // 4. Verify JobRun has been updated in database
    const jobRun = await tenantStorage.run({ tenantId, bypassRls: true }, async () => {
      return prisma.jobRun.findUnique({ where: { id: jobId } });
    });

    expect(jobRun?.status).toBe('completed');
    expect(jobRun?.startedAt).not.toBeNull();
    expect(jobRun?.completedAt).not.toBeNull();
    expect(jobRun?.attempts).toBe(1);
    expect(jobRun?.progress).toEqual({ step: 'tested' });
    expect(jobRun?.result).toEqual({ ok: true });
    expect(jobRun?.failedReason).toBeNull();
  });

  it('should transition JobRun to failed with wrapProcessor on error', async () => {
    // 1. Create a queued JobRun
    const payload = { startedAt: new Date().toISOString() };
    const jobId = await enqueue(JobType.MAINTENANCE_HEALTHCHECK, payload, { tenantId });

    // 2. Wrap a processor that throws an error
    const mockProcessor = wrapProcessor(async () => {
      throw new Error('Test processor failure');
    });

    // Mock BullMQ Job object
    const mockJob: any = {
      id: jobId,
      attemptsMade: 2,
      client: null,
      updateProgress: vi.fn(),
    };

    // 3. Run and expect error to propagate
    await expect(mockProcessor(mockJob)).rejects.toThrow('Test processor failure');

    // 4. Verify JobRun has failed state in database
    const jobRun = await tenantStorage.run({ tenantId, bypassRls: true }, async () => {
      return prisma.jobRun.findUnique({ where: { id: jobId } });
    });

    expect(jobRun?.status).toBe('failed');
    expect(jobRun?.completedAt).not.toBeNull();
    expect(jobRun?.failedReason).toBe('Test processor failure');
    expect(jobRun?.result).toBeNull();
  });
});
