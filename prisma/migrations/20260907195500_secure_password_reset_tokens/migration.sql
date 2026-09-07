-- Existing rows contain bearer tokens. They cannot be converted to digests
-- without preserving the secret, so deployment invalidates all outstanding links.
DELETE FROM "PasswordResetToken";

DROP INDEX "PasswordResetToken_token_key";

ALTER TABLE "PasswordResetToken" RENAME COLUMN "token" TO "tokenDigest";

CREATE UNIQUE INDEX "PasswordResetToken_tokenDigest_key" ON "PasswordResetToken"("tokenDigest");
