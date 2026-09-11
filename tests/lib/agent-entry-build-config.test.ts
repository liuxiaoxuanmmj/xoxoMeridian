import { execFile } from "node:child_process";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const exec = promisify(execFile);

it.each([
  { fileTheme: undefined, explicitTheme: undefined, expected: "default" },
  { fileTheme: "birthday-2026", explicitTheme: undefined, expected: "birthday-2026" },
  { fileTheme: "birthday-2026", explicitTheme: "default", expected: "default" },
])("构建配置按 Next 环境优先级冻结主题：$expected ($fileTheme/$explicitTheme)", async ({ fileTheme, explicitTheme, expected }) => {
  const directory = await mkdtemp(join(tmpdir(), "agent-entry-config-"));
  try {
    await copyFile(resolve("next.config.mjs"), join(directory, "next.config.mjs"));
    if (fileTheme) await writeFile(join(directory, ".env.production.local"), `NEXT_PUBLIC_AGENT_ENTRY_THEME=${fileTheme}\n`);
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };
    delete env.NEXT_PUBLIC_AGENT_ENTRY_THEME;
    delete env.__NEXT_PROCESSED_ENV;
    if (explicitTheme) env.NEXT_PUBLIC_AGENT_ENTRY_THEME = explicitTheme;
    // 独立进程调用锁定 Next 的真实配置加载器，避免环境缓存污染其他测试。
    const { stdout } = await exec(process.execPath, ["--input-type=module", "-e", `
      import configModule from ${JSON.stringify(resolve("node_modules/next/dist/server/config.js"))};
      const config = await configModule.default("phase-production-build", process.argv[1], undefined, undefined, true);
      process.stdout.write(JSON.stringify(config.env.NEXT_PUBLIC_AGENT_ENTRY_THEME));
    `, directory], { env });
    expect(JSON.parse(stdout)).toBe(expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
