-- AlterTable
ALTER TABLE "MessageSummary" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'range',
ADD COLUMN "messageCount" INTEGER;

-- CreateIndex
CREATE INDEX "MessageSummary_roomId_type_idx" ON "MessageSummary"("roomId", "type");
