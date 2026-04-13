import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

export const redis: Redis | null = REDIS_URL
  ? new Redis(REDIS_URL, { lazyConnect: true })
  : null;

export const redisSub: Redis | null = REDIS_URL
  ? new Redis(REDIS_URL, { lazyConnect: true })
  : null;

export async function connectRedis(): Promise<void> {
  if (!redis || !redisSub) {
    console.warn('REDIS_URL not set — running without Redis pub/sub and caching');
    return;
  }
  try {
    await redis.connect();
    await redisSub.connect();
    console.log('Redis connected');
  } catch (err) {
    console.warn('Redis connection failed, running without pub/sub:', (err as Error).message);
  }
}

export async function publishTokenEvent(event: unknown): Promise<void> {
  if (!redis) return;
  try {
    await redis.publish('pulse:token_events', JSON.stringify(event));
  } catch {
    // Redis not available
  }
}

export async function publishSessionUpdate(session: unknown): Promise<void> {
  if (!redis) return;
  try {
    await redis.publish('pulse:session_updates', JSON.stringify(session));
  } catch {
    // Redis not available
  }
}

export async function publishAlert(alert: unknown): Promise<void> {
  if (!redis) return;
  try {
    await redis.publish('pulse:alerts', JSON.stringify(alert));
  } catch {
    // Redis not available
  }
}
