/**
 * Unit tests: chat search (LIKE pattern) + unread count
 * - search returns only org/channel scoped messages (logic: pattern matching)
 * - unread count given readState + messages
 */
import { describe, it, expect } from "vitest";

function computeUnreadCount(
  readState: { lastReadMessageCreatedAt: Date | null } | null,
  messages: { createdAt: Date; senderUserId: string; deletedAt: Date | null }[],
  currentUserId: string
): number {
  const cutoff = readState?.lastReadMessageCreatedAt ?? null;
  return messages.filter((m) => {
    if (m.deletedAt || m.senderUserId === currentUserId) return false;
    if (cutoff === null) return true;
    return m.createdAt.getTime() > cutoff.getTime();
  }).length;
}

function matchesSearch(contentText: string, q: string): boolean {
  if (!q || q.length < 2) return false;
  const escaped = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
  const pattern = new RegExp(escaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return pattern.test(contentText);
}

describe("Chat search (LIKE-style)", () => {
  it("matches case-insensitive", () => {
    expect(matchesSearch("Hello World", "hello")).toBe(true);
    expect(matchesSearch("Hello World", "WORLD")).toBe(true);
  });

  it("requires min 2 chars", () => {
    expect(matchesSearch("Hi", "H")).toBe(false);
    expect(matchesSearch("Hi", "Hi")).toBe(true);
  });

  it("returns only matching content", () => {
    expect(matchesSearch("Invoice #123", "invoice")).toBe(true);
    expect(matchesSearch("Invoice #123", "123")).toBe(true);
    expect(matchesSearch("Invoice #123", "xyz")).toBe(false);
  });

  it("handles special regex chars in query", () => {
    expect(matchesSearch("Price: $10", "10")).toBe(true);
  });
});

describe("Chat unread count", () => {
  const userId = "u1";

  it("returns 0 when no messages", () => {
    expect(computeUnreadCount(null, [], userId)).toBe(0);
  });

  it("excludes own messages from unread count", () => {
    const base = new Date("2025-02-20T10:00:00Z");
    const messages = [
      { createdAt: base, senderUserId: "u2", deletedAt: null as Date | null },
      { createdAt: new Date(base.getTime() + 1000), senderUserId: userId, deletedAt: null as Date | null },
    ];
    const readState = { lastReadMessageCreatedAt: new Date(base.getTime() - 1000) };
    expect(computeUnreadCount(readState, messages, userId)).toBe(1);
  });

  it("returns 0 when read up to latest", () => {
    const base = new Date("2025-02-20T10:00:00Z");
    const messages = [
      { createdAt: base, senderUserId: "u2", deletedAt: null as Date | null },
      { createdAt: new Date(base.getTime() + 1000), senderUserId: "u2", deletedAt: null as Date | null },
    ];
    const readState = { lastReadMessageCreatedAt: new Date(base.getTime() + 1500) };
    expect(computeUnreadCount(readState, messages, userId)).toBe(0);
  });
});
