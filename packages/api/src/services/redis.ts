import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, { lazyConnect: true });
export const redisSub = new Redis(REDIS_URL, { lazyConnect: true });

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    await redisSub.connect();
    console.log('Redis connected');
  } catch (err) {
    console.warn('Redis connection failed, running without pub/sub:', (err as Error).message);
  }
}

export async function publishTokenEvent(event: unknown): Promise<void> {
  try {
    await redis.publish('pulse:token_events', JSON.stringify(event));
  } catch {
    // Redis not available
  }
}

export async function publishSessionUpdate(session: unknown): Promise<void> {
  try {
    await redis.publish('pulse:session_updates', JSON.stringify(session));
  } catch {
    // Redis not available
  }
}

export async function publishAlert(alert: unknown): Promise<void> {
  try {
    await redis.publish('pulse:alerts', JSON.stringify(alert));
  } catch {
    // Redis not available
  }
}
