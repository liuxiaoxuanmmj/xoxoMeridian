ALTER TABLE "AtlasElement"
ADD COLUMN IF NOT EXISTS "postId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "AtlasElement_postId_key"
ON "AtlasElement"("postId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AtlasElement_postId_fkey'
  ) THEN
    ALTER TABLE "AtlasElement"
    ADD CONSTRAINT "AtlasElement_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;
