-- Day 24: Team Chat - channels, messages, attachments, permissions, avatars

-- AlterTable User: displayName, avatarUpdatedAt
ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarUpdatedAt" TIMESTAMP(3);

-- CreateTable ChatChannel
CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "topic" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "slowModeSeconds" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable ChatChannelPermission
CREATE TABLE "ChatChannelPermission" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canSend" BOOLEAN NOT NULL DEFAULT true,
    "canManageChannel" BOOLEAN NOT NULL DEFAULT false,
    "canManageMessages" BOOLEAN NOT NULL DEFAULT false,
    "canPin" BOOLEAN NOT NULL DEFAULT false,
    "canUpload" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatChannelPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable ChatMessage
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "contentText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "replyToMessageId" TEXT,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable ChatMessageAttachment
CREATE TABLE "ChatMessageAttachment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable ChatMessageReaction
CREATE TABLE "ChatMessageReaction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable ChatPinnedMessage
CREATE TABLE "ChatPinnedMessage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "pinnedByUserId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatPinnedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable ChatUserChannelState
CREATE TABLE "ChatUserChannelState" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatUserChannelState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_orgId_name_key" ON "ChatChannel"("orgId", "name");
CREATE INDEX "ChatChannel_orgId_idx" ON "ChatChannel"("orgId");

CREATE UNIQUE INDEX "ChatChannelPermission_channelId_role_key" ON "ChatChannelPermission"("channelId", "role");
CREATE INDEX "ChatChannelPermission_orgId_idx" ON "ChatChannelPermission"("orgId");
CREATE INDEX "ChatChannelPermission_channelId_idx" ON "ChatChannelPermission"("channelId");

CREATE INDEX "ChatMessage_orgId_channelId_createdAt_idx" ON "ChatMessage"("orgId", "channelId", "createdAt" DESC);
CREATE INDEX "ChatMessage_channelId_idx" ON "ChatMessage"("channelId");

CREATE INDEX "ChatMessageAttachment_orgId_idx" ON "ChatMessageAttachment"("orgId");
CREATE INDEX "ChatMessageAttachment_messageId_idx" ON "ChatMessageAttachment"("messageId");

CREATE UNIQUE INDEX "ChatMessageReaction_messageId_emoji_userId_key" ON "ChatMessageReaction"("messageId", "emoji", "userId");
CREATE INDEX "ChatMessageReaction_messageId_idx" ON "ChatMessageReaction"("messageId");

CREATE UNIQUE INDEX "ChatPinnedMessage_channelId_messageId_key" ON "ChatPinnedMessage"("channelId", "messageId");
CREATE INDEX "ChatPinnedMessage_channelId_idx" ON "ChatPinnedMessage"("channelId");

CREATE UNIQUE INDEX "ChatUserChannelState_channelId_userId_key" ON "ChatUserChannelState"("channelId", "userId");
CREATE INDEX "ChatUserChannelState_orgId_idx" ON "ChatUserChannelState"("orgId");
CREATE INDEX "ChatUserChannelState_channelId_idx" ON "ChatUserChannelState"("channelId");

-- AddForeignKey
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatChannelPermission" ADD CONSTRAINT "ChatChannelPermission_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessageAttachment" ADD CONSTRAINT "ChatMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessageReaction" ADD CONSTRAINT "ChatMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatPinnedMessage" ADD CONSTRAINT "ChatPinnedMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPinnedMessage" ADD CONSTRAINT "ChatPinnedMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
