ALTER TABLE "FocusSession"
  ADD COLUMN "sessionKey" TEXT;

UPDATE "FocusSession"
SET "sessionKey" = 'legacy:' || "id"
WHERE "sessionKey" IS NULL;

ALTER TABLE "FocusSession"
  ALTER COLUMN "sessionKey" SET NOT NULL;

CREATE UNIQUE INDEX "FocusSession_userId_sessionKey_key"
  ON "FocusSession"("userId", "sessionKey");

UPDATE "FocusState"
SET "currentSessionKey" = 'legacy:' || "id"
WHERE "currentSessionKey" IS NULL
  AND "status" IN ('running', 'paused');
