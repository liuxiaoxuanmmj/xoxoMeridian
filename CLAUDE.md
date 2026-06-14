# xoxoMeridian 项目规范

## 数据库迁移规范

### 迁移执行方式

本项目使用 Docker Compose 部署，**所有数据库 schema 变更必须通过 `init` 容器自动执行**，不要手动运行 `npx prisma migrate dev`。

### 标准流程

1. **修改 Prisma Schema**
   - 编辑 `prisma/schema.prisma`
   - 确保 schema 变更符合业务需求

2. **创建迁移文件**
   - 在 `prisma/migrations/` 下创建新目录，命名格式：`YYYYMMDDHHMMSS_描述`
   - 在目录中创建 `migration.sql` 文件，编写 SQL 语句
   - 使用 `IF EXISTS` / `IF NOT EXISTS` 确保幂等性

3. **部署迁移**
   ```bash
   docker compose build web agent-worker init
   docker compose up -d
   ```
   - `init` 容器会自动执行 `npx prisma migrate deploy`
   - 所有待执行的迁移会按时间顺序应用

### 迁移文件示例

```
prisma/migrations/20260531120000_remove_session_token_field/
└── migration.sql
```

```sql
-- DropIndex
DROP INDEX IF EXISTS "Session_token_key";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN IF EXISTS "token";
```

### 注意事项

- **不要**在开发环境直接运行 `prisma migrate dev`（会导致迁移历史不同步）
- **不要**手动连接数据库执行 SQL（绕过迁移历史追踪）
- 破坏性变更（删除表/字段）需在迁移文件中添加注释说明影响范围
- 会话相关变更会导致所有用户被登出

### 回滚方案

如需回滚，创建新的迁移文件执行反向操作，不要删除已应用的迁移文件。

## 代码生成规范

### 注意事项

- 生成测试用例时**不要**作兜底，以确保测试能够真正发现代码漏洞
