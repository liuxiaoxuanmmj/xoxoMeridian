-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PostType" AS ENUM ('user_post', 'agent_log');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Post" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "type" "PostType" NOT NULL DEFAULT 'user_post',
  "authorId" TEXT,
  "roomId" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Post_slug_key" ON "Post"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Post_type_publishedAt_idx" ON "Post"("type", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Post_authorId_idx" ON "Post"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Post_roomId_idx" ON "Post"("roomId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Post" ADD CONSTRAINT "Post_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
