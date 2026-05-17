-- DropForeignKey
ALTER TABLE "Note" DROP CONSTRAINT "Note_agentTaskId_fkey";

-- DropForeignKey
ALTER TABLE "Note" DROP CONSTRAINT "Note_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Note" DROP CONSTRAINT "Note_roomId_fkey";

-- DropTable
DROP TABLE "Note";
