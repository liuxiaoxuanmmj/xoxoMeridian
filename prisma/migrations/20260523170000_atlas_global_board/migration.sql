-- DropForeignKey
ALTER TABLE "AtlasBoard" DROP CONSTRAINT "AtlasBoard_roomId_fkey";

-- DropIndex
DROP INDEX "AtlasBoard_roomId_key";

-- AlterTable
ALTER TABLE "AtlasBoard" DROP COLUMN "roomId";

-- Data migration: merge all boards into one global board
DO $$
DECLARE
  global_board_id TEXT := 'atlas-global-board';
  first_board_id TEXT;
BEGIN
  -- Get the first existing board ID (if any)
  SELECT id INTO first_board_id FROM "AtlasBoard" LIMIT 1;

  IF first_board_id IS NOT NULL THEN
    -- Update the first board to use the global ID
    UPDATE "AtlasBoard" SET id = global_board_id WHERE id = first_board_id;

    -- Migrate all elements and connections from other boards to the global board
    UPDATE "AtlasElement" SET "boardId" = global_board_id WHERE "boardId" != global_board_id;
    UPDATE "AtlasConnection" SET "boardId" = global_board_id WHERE "boardId" != global_board_id;

    -- Delete all other boards
    DELETE FROM "AtlasBoard" WHERE id != global_board_id;
  ELSE
    -- No existing boards, create the global board
    INSERT INTO "AtlasBoard" (id, "createdAt", "updatedAt")
    VALUES (global_board_id, NOW(), NOW());
  END IF;
END $$;
