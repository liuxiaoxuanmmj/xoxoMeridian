# 数据库迁移说明

## Session 表结构变更

### 变更内容
移除了 `Session.token` 字段（与 `id` 字段完全重复）。

### 迁移步骤

**重要**：此迁移会使所有现有会话失效，所有用户需要重新登录。

1. 生成迁移文件：
```bash
npx prisma migrate dev --name remove_session_token_field
```

2. 应用迁移：
```bash
npx prisma migrate deploy
```

3. 或者手动执行 SQL（如果不想使用 Prisma Migrate）：
```sql
-- 删除 token 列的 unique 索引
DROP INDEX IF EXISTS "Session_token_key";

-- 删除 token 列
ALTER TABLE "Session" DROP COLUMN "token";
```

### 影响范围
- 所有现有 session 记录保持不变（只是少了一个冗余字段）
- `lib/auth.ts` 中的 `setSessionCookie` 已更新，不再写入 `token` 字段
- 所有用户需要重新登录（因为迁移会清空 Session 表）

### 回滚方案
如果需要回滚：
```sql
ALTER TABLE "Session" ADD COLUMN "token" TEXT;
UPDATE "Session" SET "token" = "id";
ALTER TABLE "Session" ALTER COLUMN "token" SET NOT NULL;
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
```
