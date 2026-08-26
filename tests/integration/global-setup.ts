import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

const execFileAsync = promisify(execFile);

let postgres: StartedPostgreSqlContainer | undefined;

export async function setup() {
  try {
    postgres = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("xoxo_meridian_test")
      .withUsername("xoxo_test")
      .withPassword("xoxo_test_password")
      .start();
  } catch (error) {
    throw new Error(
      "无法启动 PostgreSQL Testcontainer。请确认 Docker daemon 可用且当前用户可访问；集成测试不会静默跳过。",
      { cause: error }
    );
  }

  const databaseUrl = postgres.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = databaseUrl;
  Object.assign(process.env, { NODE_ENV: "test" });

  const prismaCli = resolve("node_modules/prisma/build/index.js");
  await execFileAsync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
    },
  });
}

export async function teardown() {
  await postgres?.stop();
  postgres = undefined;
}
