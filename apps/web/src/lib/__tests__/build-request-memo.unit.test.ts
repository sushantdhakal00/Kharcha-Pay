import { describe, it, expect } from "vitest";
import { buildRequestMemo } from "../solana/payments";

describe("buildRequestMemo", () => {
  it("without orgSlug returns KharchaPay Request + requestId", () => {
    const requestId = "clxyz123abc";
    expect(buildRequestMemo(requestId)).toBe("KharchaPay Request clxyz123abc");
  });

  it("with orgSlug returns KharchaPay Request + requestId + orgSlug", () => {
    const requestId = "clxyz123abc";
    const orgSlug = "acme-corp";
    expect(buildRequestMemo(requestId, orgSlug)).toBe(
      "KharchaPay Request clxyz123abc acme-corp"
    );
  });

  it("produces stable format for various requestIds", () => {
    expect(buildRequestMemo("a")).toBe("KharchaPay Request a");
    expect(buildRequestMemo("req-001", "org")).toBe("KharchaPay Request req-001 org");
  });

  it("memo length stays within typical Solana memo limits (566 bytes)", () => {
    const longId = "a".repeat(100);
    const memo = buildRequestMemo(longId, "slug");
    expect(memo.length).toBeLessThan(566);
  });
});
