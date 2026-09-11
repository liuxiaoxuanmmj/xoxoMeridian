-- FocusState / FocusSession 的 updatedAt 由 Prisma 的 @updatedAt 在应用层维护，
-- schema 中该字段没有 DB 层默认值；但建表迁移 20260629120000_add_study_room_models
-- 给这两张表加了 DEFAULT CURRENT_TIMESTAMP，导致 prisma migrate diff 持续报出
-- "updatedAt DROP DEFAULT" 漂移。此处移除该默认值，使 DB 与 schema 对齐。
--
-- 注意：createdAt 保留 DEFAULT CURRENT_TIMESTAMP，因为 schema 的 @default(now())
-- 本就对应 DB 默认值，不属于漂移。
--
-- PostgreSQL 的 DROP DEFAULT 在列本来就没有默认值时为无操作，可安全重复执行。
ALTER TABLE "FocusState" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "FocusSession" ALTER COLUMN "updatedAt" DROP DEFAULT;
