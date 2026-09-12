BEGIN;

LOCK TABLE "Memory" IN ACCESS EXCLUSIVE MODE;

ALTER TABLE "Memory" ADD COLUMN "ownerKey" TEXT;

UPDATE "Memory"
SET
  "ownerKey" = 'scope:shared',
  "metadata" = CASE
    WHEN "userId" IS NULL THEN "metadata"
    ELSE (
      CASE
        WHEN "metadata" IS NULL THEN '{}'::jsonb
        WHEN jsonb_typeof("metadata") = 'object' THEN "metadata"
        ELSE jsonb_build_object('previousMetadata', "metadata")
      END
    ) || jsonb_build_object(
      'ownerMigration',
      jsonb_build_object(
        'version', '20260912175500',
        'status', 'normalized-shared',
        'originalUserId', "userId"
      )
    )
  END,
  "userId" = NULL
WHERE "key" LIKE 'shared.%' AND length("key") > 7;

UPDATE "Memory"
SET
  "ownerKey" = 'scope:system',
  "metadata" = CASE
    WHEN "userId" IS NULL THEN "metadata"
    ELSE (
      CASE
        WHEN "metadata" IS NULL THEN '{}'::jsonb
        WHEN jsonb_typeof("metadata") = 'object' THEN "metadata"
        ELSE jsonb_build_object('previousMetadata', "metadata")
      END
    ) || jsonb_build_object(
      'ownerMigration',
      jsonb_build_object(
        'version', '20260912175500',
        'status', 'normalized-system',
        'originalUserId', "userId"
      )
    )
  END,
  "userId" = NULL
WHERE left("key", 8) = '_system.' AND length("key") > 8;

CREATE TEMP TABLE "_MemoryOwnerMigration" ON COMMIT DROP AS
WITH normalized AS (
  SELECT
    "id",
    "roomId",
    "userId",
    "key" AS "originalKey",
    CASE
      WHEN "key" LIKE 'me.%' THEN 'person.' || substring("key" FROM 4)
      WHEN "key" LIKE 'her.%' THEN 'person.' || substring("key" FROM 5)
      ELSE "key"
    END AS "normalizedKey",
    "updatedAt"
  FROM "Memory"
  WHERE
    "ownerKey" IS NULL
    AND "userId" IS NOT NULL
    AND (
      ("key" LIKE 'me.%' AND length("key") > 3)
      OR ("key" LIKE 'her.%' AND length("key") > 4)
      OR ("key" LIKE 'person.%' AND length("key") > 7)
    )
), ranked AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY "roomId", "userId", "normalizedKey"
      ORDER BY "updatedAt" DESC, "id" DESC
    ) AS "normalizationRank",
    first_value("id") OVER (
      PARTITION BY "roomId", "userId", "normalizedKey"
      ORDER BY "updatedAt" DESC, "id" DESC
    ) AS "selectedId"
  FROM normalized
)
SELECT * FROM ranked;

UPDATE "Memory" AS memory
SET
  "ownerKey" = 'legacy:' || memory."id",
  "metadata" = (
    CASE
      WHEN memory."metadata" IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(memory."metadata") = 'object' THEN memory."metadata"
      ELSE jsonb_build_object('previousMetadata', memory."metadata")
    END
  ) || jsonb_build_object(
    'ownerMigration',
    jsonb_build_object(
      'version', '20260912175500',
      'status', 'normalization-conflict',
      'originalKey', migration."originalKey",
      'normalizedKey', migration."normalizedKey",
      'selectedId', migration."selectedId"
    )
  )
FROM "_MemoryOwnerMigration" AS migration
WHERE
  memory."id" = migration."id"
  AND migration."normalizationRank" > 1;

DROP INDEX "Memory_roomId_key_key";

UPDATE "Memory" AS memory
SET
  "ownerKey" = 'user:' || migration."userId",
  "key" = migration."normalizedKey",
  "metadata" = CASE
    WHEN migration."originalKey" = migration."normalizedKey" THEN memory."metadata"
    ELSE (
      CASE
        WHEN memory."metadata" IS NULL THEN '{}'::jsonb
        WHEN jsonb_typeof(memory."metadata") = 'object' THEN memory."metadata"
        ELSE jsonb_build_object('previousMetadata', memory."metadata")
      END
    ) || jsonb_build_object(
      'ownerMigration',
      jsonb_build_object(
        'version', '20260912175500',
        'status', 'normalized-personal',
        'originalKey', migration."originalKey"
      )
    )
  END
FROM "_MemoryOwnerMigration" AS migration
WHERE
  memory."id" = migration."id"
  AND migration."normalizationRank" = 1;

UPDATE "Memory"
SET
  "ownerKey" = 'legacy:' || "id",
  "metadata" = (
    CASE
      WHEN "metadata" IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof("metadata") = 'object' THEN "metadata"
      ELSE jsonb_build_object('previousMetadata', "metadata")
    END
  ) || jsonb_build_object(
    'ownerMigration',
    jsonb_build_object(
      'version', '20260912175500',
      'status', CASE
        WHEN "key" LIKE 'me.%' OR "key" LIKE 'her.%' OR "key" LIKE 'person.%'
          THEN 'ambiguous-personal-owner'
        ELSE 'unsupported-key'
      END,
      'originalKey', "key",
      'originalUserId', "userId"
    )
  )
WHERE "ownerKey" IS NULL;

ALTER TABLE "Memory" ALTER COLUMN "ownerKey" SET NOT NULL;

CREATE UNIQUE INDEX "Memory_roomId_ownerKey_key_key"
ON "Memory"("roomId", "ownerKey", "key");

ALTER TABLE "Memory"
ADD CONSTRAINT "Memory_owner_contract_check"
CHECK (
  (
    "ownerKey" = 'scope:shared'
    AND "userId" IS NULL
    AND "key" LIKE 'shared.%'
    AND length("key") > 7
  )
  OR (
    "ownerKey" = 'scope:system'
    AND "userId" IS NULL
    AND left("key", 8) = '_system.'
    AND length("key") > 8
  )
  OR (
    "ownerKey" LIKE 'user:%'
    AND "key" LIKE 'person.%'
    AND length("key") > 7
    AND ("userId" IS NULL OR "ownerKey" = 'user:' || "userId")
  )
  OR "ownerKey" = 'legacy:' || "id"
);

COMMIT;
