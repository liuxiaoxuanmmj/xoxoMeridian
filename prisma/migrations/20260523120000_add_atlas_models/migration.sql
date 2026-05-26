-- CreateEnum
CREATE TYPE "AtlasElementType" AS ENUM ('photo', 'note');

-- CreateTable
CREATE TABLE "AtlasBoard" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtlasBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtlasElement" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "type" "AtlasElementType" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT,
    "imageUrl" TEXT,
    "caption" TEXT,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 250,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtlasElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtlasConnection" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#8B7355',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtlasConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AtlasBoard_roomId_key" ON "AtlasBoard"("roomId");

-- CreateIndex
CREATE INDEX "AtlasElement_boardId_x_y_idx" ON "AtlasElement"("boardId", "x", "y");

-- CreateIndex
CREATE INDEX "AtlasElement_boardId_zIndex_idx" ON "AtlasElement"("boardId", "zIndex");

-- CreateIndex
CREATE INDEX "AtlasConnection_boardId_idx" ON "AtlasConnection"("boardId");

-- CreateIndex
CREATE UNIQUE INDEX "AtlasConnection_boardId_fromId_toId_key" ON "AtlasConnection"("boardId", "fromId", "toId");

-- AddForeignKey
ALTER TABLE "AtlasBoard" ADD CONSTRAINT "AtlasBoard_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtlasElement" ADD CONSTRAINT "AtlasElement_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "AtlasBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtlasElement" ADD CONSTRAINT "AtlasElement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtlasConnection" ADD CONSTRAINT "AtlasConnection_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "AtlasBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtlasConnection" ADD CONSTRAINT "AtlasConnection_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "AtlasElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtlasConnection" ADD CONSTRAINT "AtlasConnection_toId_fkey" FOREIGN KEY ("toId") REFERENCES "AtlasElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
