import { describe, it, expect } from "vitest";
import { toCsv } from "../csv";

describe("toCsv RFC4180", () => {
  it("escapes commas in fields", () => {
    const rows = [{ a: "hello, world", b: 1 }];
    const csv = toCsv(rows, ["a", "b"]);
    expect(csv).toContain('"hello, world"');
  });

  it("escapes quotes in fields", () => {
    const rows = [{ a: 'say "hi"', b: 1 }];
    const csv = toCsv(rows, ["a", "b"]);
    expect(csv).toContain('"say ""hi"""');
  });

  it("escapes newlines in fields", () => {
    const rows = [{ a: "line1\nline2", b: 1 }];
    const csv = toCsv(rows, ["a", "b"]);
    expect(csv).toContain('"line1\nline2"');
  });

  it("handles null and undefined as empty string", () => {
    const rows = [{ a: null, b: undefined, c: "ok" }];
    const csv = toCsv(rows, ["a", "b", "c"]);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe(",,ok");
  });

  it("uses CRLF line endings", () => {
    const rows = [{ a: 1 }];
    const csv = toCsv(rows, ["a"]);
    expect(csv).toBe("a\r\n1");
  });
});
