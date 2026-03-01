-- Day 14: Receipt storage outside public/; storageKey + storageProvider; url optional for legacy
ALTER TABLE "ReceiptFile" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "ReceiptFile" ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "ReceiptFile" ALTER COLUMN "url" DROP NOT NULL;

-- Backfill: existing rows with url like /uploads/... get storageKey = basename, storageProvider = PUBLIC_LEGACY
UPDATE "ReceiptFile"
SET "storageKey" = regexp_replace("url", '^.*/', ''),
    "storageProvider" = 'PUBLIC_LEGACY'
WHERE "url" IS NOT NULL AND "url" LIKE '/uploads/%';
