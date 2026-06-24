import { Redis } from 'ioredis';

const DEFAULT_REDIS_URL = 'redis://localhost:6379';
const CACHE_PREFIX = 'crm4u:cache:';

let client: Redis | null = null;

function getClient(): Redis | null {
  if (client) return client;
  const url = process.env.REDIS_URL || DEFAULT_REDIS_URL;
  try {
    client = new Redis(url, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    return client;
  } catch {
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const c = getClient();
  if (!c) return null;
  try {
    const raw = await c.get(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttl: number = 60): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.setex(`${CACHE_PREFIX}${key}`, ttl, JSON.stringify(value));
  } catch {
    // silently fail — cache is optional
  }
}

export async function cacheDel(key: string): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.del(`${CACHE_PREFIX}${key}`);
  } catch {
    // silently fail
  }
}
