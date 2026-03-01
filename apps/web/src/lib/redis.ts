/**
 * Redis client for pub/sub. Lazy init; falls back to null when REDIS_URL not set.
 */
import Redis from "ioredis";

let _client: Redis | null = null;

export function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url?.trim()) return null;
  if (_client) return _client;
  try {
    _client = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    return _client;
  } catch {
    return null;
  }
}

export function closeRedis(): void {
  if (_client) {
    _client.disconnect();
    _client = null;
  }
}
