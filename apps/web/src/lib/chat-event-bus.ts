/**
 * Chat event bus: Redis Pub/Sub when REDIS_URL set, else in-memory.
 * Supports multi-instance SSE: publish from instance A reaches clients on instance B.
 */
import { randomUUID } from "crypto";
import { getRedisClient } from "./redis";
import type { ChatEvent } from "./chat-pubsub";

export type ChatEventEnvelope = {
  id: string;
  type: string;
  orgId: string;
  channelId: string;
  ts: number;
  payload: unknown;
};

const CHANNEL_PREFIX = "org:";
const CHANNEL_ALL_SUFFIX = ":chat:all";

function channelKey(orgId: string, channelId: string): string {
  return `${CHANNEL_PREFIX}${orgId}:chat:${channelId}`;
}

function orgAllKey(orgId: string): string {
  return `${CHANNEL_PREFIX}${orgId}${CHANNEL_ALL_SUFFIX}`;
}

export function publishToRedis(orgId: string, channelId: string, event: Omit<ChatEvent, "channelId">): void {
  const redis = getRedisClient();
  const envelope: ChatEventEnvelope = {
    id: randomUUID(),
    type: event.type,
    orgId,
    channelId,
    ts: Date.now(),
    payload: event.payload,
  };
  const msg = JSON.stringify(envelope);
  if (redis) {
    redis.publish(channelKey(orgId, channelId), msg).catch(() => {});
    redis.publish(orgAllKey(orgId), msg).catch(() => {});
  }
}

export function subscribeRedis(
  orgId: string,
  channelId: string,
  onMessage: (envelope: ChatEventEnvelope) => void
): () => void {
  const redis = getRedisClient();
  if (!redis) return () => {};

  const chKey = channelKey(orgId, channelId);
  const allKey = orgAllKey(orgId);

  const handler = (chn: string, message: string) => {
    try {
      const envelope = JSON.parse(message) as ChatEventEnvelope;
      if (chn === chKey || (chn === allKey && envelope.channelId === channelId)) {
        onMessage(envelope);
      }
    } catch {
      /* ignore */
    }
  };

  const sub = redis.duplicate();
  sub.subscribe(chKey, allKey, (err) => {
    if (err) sub.quit();
  });
  sub.on("message", handler);

  return () => {
    sub.unsubscribe(chKey, allKey);
    sub.quit();
  };
}
