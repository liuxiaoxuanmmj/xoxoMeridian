-- Add sessionVersion column for single-active-session enforcement.
-- A new login increments this value, causing all previously issued cookies
-- (which embed the version they were signed with) to fail verification.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
