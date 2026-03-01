-- Day 25: Unread counts, mentions, search, pinned panel, SSE push

-- Add mentionsUserIds to ChatMessage
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "mentionsUserIds" JSONB;

-- CreateTable ChatChannelReadState
CREATE TABLE "ChatChannelReadState" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReadAt" TIMESTAMP(3),
    "lastReadMessageCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatChannelReadState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatChannelReadState_orgId_channelId_userId_key" ON "ChatChannelReadState"("orgId", "channelId", "userId");
CREATE INDEX "ChatChannelReadState_orgId_idx" ON "ChatChannelReadState"("orgId");
CREATE INDEX "ChatChannelReadState_channelId_idx" ON "ChatChannelReadState"("channelId");
