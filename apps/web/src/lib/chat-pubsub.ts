/**
 * Chat pub/sub: Redis when REDIS_URL set, else in-memory.
 * Multi-instance: publish from instance A reaches SSE clients on instance B via Redis.
 */
import { publishToRedis, subscribeRedis, type ChatEventEnvelope } from "./chat-event-bus";
import { getRedisClient } from "./redis";

export type ChatEvent =
  | { type: "message.created"; channelId: string; payload: unknown }
  | { type: "message.updated"; channelId: string; payload: unknown }
  | { type: "message.deleted"; channelId: string; payload: unknown }
  | { type: "pinned.updated"; channelId: string; payload: unknown }
  | { type: "unread.updated"; channelId: string; payload: unknown };

type Listener = (event: ChatEvent) => void;

const listenersByKey = new Map<string, Set<Listener>>();

function key(orgId: string, channelId: string): string {
  return `${orgId}:${channelId}`;
}

export function subscribe(orgId: string, channelId: string, listener: Listener): () => void {
  const k = key(orgId, channelId);
  let set = listenersByKey.get(k);
  if (!set) {
    set = new Set();
    listenersByKey.set(k, set);
  }
  set.add(listener);

  const unsubRedis = subscribeRedis(orgId, channelId, (envelope: ChatEventEnvelope) => {
    const full: ChatEvent = { type: envelope.type as ChatEvent["type"], channelId: envelope.channelId, payload: envelope.payload };
    try {
      listener(full);
    } catch {
      /* ignore */
    }
  });

  return () => {
    set!.delete(listener);
    if (set!.size === 0) listenersByKey.delete(k);
    unsubRedis();
  };
}

export function publish(orgId: string, channelId: string, event: Omit<ChatEvent, "channelId">): void {
  const full: ChatEvent = { ...event, channelId };
  const redis = getRedisClient();

  if (redis) {
    publishToRedis(orgId, channelId, event);
    return;
  }

  const k = key(orgId, channelId);
  const set = listenersByKey.get(k);
  if (set) {
    for (const l of set) {
      try {
        l(full);
      } catch {
        /* ignore */
      }
    }
  }

  if (process.env.NODE_ENV === "production") {
    console.warn("[chat-pubsub] REDIS_URL not set; SSE only works on single instance");
  }
}
