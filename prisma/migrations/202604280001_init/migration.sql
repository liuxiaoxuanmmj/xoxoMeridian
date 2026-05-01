CREATE TYPE "SenderType" AS ENUM ('human', 'agent', 'system');
CREATE TYPE "TargetType" AS ENUM ('all', 'user', 'agent');
CREATE TYPE "MessageStatus" AS ENUM ('sent', 'processing', 'failed');
CREATE TYPE "AgentTaskStatus" AS ENUM ('pending', 'running', 'completed', 'failed');
CREATE TYPE "ToolCallStatus" AS ENUM ('running', 'completed', 'failed');
CREATE TYPE "LLMCallStatus" AS ENUM ('completed', 'failed');
CREATE TYPE "ReminderStatus" AS ENUM ('pending', 'done', 'cancelled');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "avatarLabel" TEXT NOT NULL,
  "demoRole" TEXT,
  "passwordHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "preferences" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Room" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "maxHumanUsers" INTEGER NOT NULL DEFAULT 2,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoomParticipant" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoomParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "senderId" TEXT,
  "senderAgentId" TEXT,
  "senderType" "SenderType" NOT NULL,
  "content" TEXT NOT NULL,
  "targetType" "TargetType" NOT NULL DEFAULT 'all',
  "targetId" TEXT,
  "status" "MessageStatus" NOT NULL DEFAULT 'sent',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Agent" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentTask" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "sourceMessageId" TEXT,
  "requestedById" TEXT,
  "status" "AgentTaskStatus" NOT NULL DEFAULT 'pending',
  "input" JSONB NOT NULL,
  "plan" JSONB,
  "result" JSONB,
  "error" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "finalMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ToolCall" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "toolName" TEXT NOT NULL,
  "input" JSONB,
  "output" JSONB,
  "status" "ToolCallStatus" NOT NULL DEFAULT 'running',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ToolCall_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LLMCall" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "inputSummary" TEXT NOT NULL,
  "requestPayload" JSONB,
  "responsePayload" JSONB,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "totalTokens" INTEGER,
  "status" "LLMCallStatus" NOT NULL,
  "error" TEXT,
  "durationMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LLMCall_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Memo" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "createdById" TEXT,
  "agentTaskId" TEXT,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Memo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Note" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "createdById" TEXT,
  "agentTaskId" TEXT,
  "content" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT 'warm',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reminder" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "createdById" TEXT,
  "agentTaskId" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "dueAt" TIMESTAMP(3),
  "timezone" TEXT,
  "contactWindowStart" TEXT,
  "contactWindowEnd" TEXT,
  "notifyChannel" TEXT,
  "status" "ReminderStatus" NOT NULL DEFAULT 'pending',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageSummary" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "rangeStartId" TEXT,
  "rangeEndId" TEXT,
  "summary" TEXT NOT NULL,
  "tokenEstimate" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageSummary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Memory" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "userId" TEXT,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "source" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventLog" (
  "id" TEXT NOT NULL,
  "roomId" TEXT,
  "actorUserId" TEXT,
  "agentTaskId" TEXT,
  "type" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_demoRole_key" ON "User"("demoRole");
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");
CREATE UNIQUE INDEX "Room_slug_key" ON "Room"("slug");
CREATE UNIQUE INDEX "RoomParticipant_roomId_userId_key" ON "RoomParticipant"("roomId", "userId");
CREATE INDEX "RoomParticipant_userId_idx" ON "RoomParticipant"("userId");
CREATE INDEX "Message_roomId_createdAt_idx" ON "Message"("roomId", "createdAt");
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");
CREATE INDEX "Message_senderAgentId_idx" ON "Message"("senderAgentId");
CREATE UNIQUE INDEX "Agent_slug_key" ON "Agent"("slug");
CREATE UNIQUE INDEX "AgentTask_sourceMessageId_key" ON "AgentTask"("sourceMessageId");
CREATE UNIQUE INDEX "AgentTask_finalMessageId_key" ON "AgentTask"("finalMessageId");
CREATE INDEX "AgentTask_status_createdAt_idx" ON "AgentTask"("status", "createdAt");
CREATE INDEX "AgentTask_roomId_idx" ON "AgentTask"("roomId");
CREATE INDEX "AgentTask_agentId_idx" ON "AgentTask"("agentId");
CREATE INDEX "ToolCall_taskId_idx" ON "ToolCall"("taskId");
CREATE INDEX "ToolCall_toolName_idx" ON "ToolCall"("toolName");
CREATE INDEX "LLMCall_taskId_idx" ON "LLMCall"("taskId");
CREATE INDEX "Memo_roomId_createdAt_idx" ON "Memo"("roomId", "createdAt");
CREATE INDEX "Note_roomId_createdAt_idx" ON "Note"("roomId", "createdAt");
CREATE INDEX "Reminder_roomId_status_createdAt_idx" ON "Reminder"("roomId", "status", "createdAt");
CREATE INDEX "MessageSummary_roomId_createdAt_idx" ON "MessageSummary"("roomId", "createdAt");
CREATE UNIQUE INDEX "Memory_roomId_key_key" ON "Memory"("roomId", "key");
CREATE INDEX "Memory_userId_idx" ON "Memory"("userId");
CREATE INDEX "EventLog_roomId_createdAt_idx" ON "EventLog"("roomId", "createdAt");
CREATE INDEX "EventLog_agentTaskId_createdAt_idx" ON "EventLog"("agentTaskId", "createdAt");

ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomParticipant" ADD CONSTRAINT "RoomParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomParticipant" ADD CONSTRAINT "RoomParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderAgentId_fkey" FOREIGN KEY ("senderAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_finalMessageId_fkey" FOREIGN KEY ("finalMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ToolCall" ADD CONSTRAINT "ToolCall_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LLMCall" ADD CONSTRAINT "LLMCall_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Memo" ADD CONSTRAINT "Memo_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Memo" ADD CONSTRAINT "Memo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Memo" ADD CONSTRAINT "Memo_agentTaskId_fkey" FOREIGN KEY ("agentTaskId") REFERENCES "AgentTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_agentTaskId_fkey" FOREIGN KEY ("agentTaskId") REFERENCES "AgentTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_agentTaskId_fkey" FOREIGN KEY ("agentTaskId") REFERENCES "AgentTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageSummary" ADD CONSTRAINT "MessageSummary_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_agentTaskId_fkey" FOREIGN KEY ("agentTaskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
