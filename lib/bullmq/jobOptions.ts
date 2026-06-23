import type { JobsOptions } from 'bullmq';
import { JobType } from './types';

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: {
    age: 86400 * 3,
    count: 500,
  },
  removeOnFail: {
    age: 86400 * 7,
    count: 100,
  },
};

export const JOB_OPTIONS: Partial<Record<JobType, JobsOptions>> = {
  [JobType.EMAIL_SEND]: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400 * 7, count: 1000 },
    removeOnFail: { age: 86400 * 14, count: 500 },
  },
  [JobType.SEQUENCE_ENROLL]: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 3000 },
  },
  [JobType.SEQUENCE_ADVANCE]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
  [JobType.IMPORT_PARSE]: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    timeout: 300000,
  },
  [JobType.IMPORT_CHUNK]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    timeout: 60000,
  },
  [JobType.MAINTENANCE_HEALTHCHECK]: {
    attempts: 1,
    removeOnComplete: { age: 86400, count: 50 },
    removeOnFail: { age: 86400 * 3, count: 50 },
  },
  [JobType.MAINTENANCE_REPAIR]: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 10000 },
    timeout: 120000,
  },
};
