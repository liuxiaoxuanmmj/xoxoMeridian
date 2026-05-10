/*
  Warnings:

  - You are about to drop the column `demoRole` on the `User` table. All the data in the column will be lost.
  - Made the column `passwordHash` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "User_demoRole_key";

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "systemPrompt" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "demoRole",
ALTER COLUMN "passwordHash" SET NOT NULL;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "profileNote" TEXT;
