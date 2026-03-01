import { describe, it, expect } from "vitest";
import {
  validateInvoiceAttachment,
  INVOICE_ATTACHMENT_MAX_BYTES,
  ALLOWED_MIME_TYPES,
  detectMimeFromMagic,
} from "../invoice-attachment-upload";

const PDF_HEADER = Buffer.from("%PDF-1.4");
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("invoice-attachment-upload", () => {
  describe("detectMimeFromMagic", () => {
    it("detects PDF", () => {
      expect(detectMimeFromMagic(PDF_HEADER)).toBe("application/pdf");
    });
    it("detects JPEG", () => {
      expect(detectMimeFromMagic(JPEG_HEADER)).toBe("image/jpeg");
    });
    it("detects PNG", () => {
      expect(detectMimeFromMagic(PNG_HEADER)).toBe("image/png");
    });
    it("returns null for invalid signature", () => {
      expect(detectMimeFromMagic(Buffer.from("NOTAPDF"))).toBe(null);
    });
  });

  describe("validateInvoiceAttachment", () => {
    it("rejects oversized files", () => {
      const buf = Buffer.alloc(INVOICE_ATTACHMENT_MAX_BYTES + 1);
      PDF_HEADER.copy(buf);
      const r = validateInvoiceAttachment(buf, "application/pdf", buf.length);
      expect(r.allowed).toBe(false);
      expect("error" in r && r.error).toContain("too large");
    });
    it("rejects invalid mime types", () => {
      const buf = Buffer.concat([PDF_HEADER, Buffer.alloc(100)]);
      const r = validateInvoiceAttachment(buf, "application/x-executable", buf.length);
      expect(r.allowed).toBe(false);
    });
    it("rejects size mismatch", () => {
      const buf = Buffer.concat([PDF_HEADER, Buffer.alloc(100)]);
      const r = validateInvoiceAttachment(buf, "application/pdf", 200);
      expect(r.allowed).toBe(false);
      expect("error" in r && r.error).toBe("File size mismatch");
    });
    it("accepts valid PDF", () => {
      const buf = Buffer.concat([PDF_HEADER, Buffer.alloc(100)]);
      const r = validateInvoiceAttachment(buf, "application/pdf", buf.length);
      expect(r.allowed).toBe(true);
      if (r.allowed) expect(r.detectedMime).toBe("application/pdf");
    });
  });
});
