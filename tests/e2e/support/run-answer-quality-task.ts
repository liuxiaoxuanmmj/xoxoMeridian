import { runAgentTask } from "@/agent/agent-runtime";
import { prisma } from "@/lib/prisma";

const [taskId, fixtureOrigin] = process.argv.slice(2);
if (!taskId || process.env.NODE_ENV !== "test" || !fixtureOrigin
  || new URL(fixtureOrigin).hostname !== "127.0.0.1") {
  throw new Error("仅允许隔离测试任务与本机 HTTP 供应商替身。");
}

// 替换进程外 HTTP 边界，保留生产 Provider、QWeather/Tavily adapter 和 Runtime。
// 未列入许可的 URL 直接报错，测试不会使用开发机真实供应商或凭据。
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  let target: string;
  if (url.origin === fixtureOrigin) target = url.toString();
  else if (url.hostname === "answer-quality.qweather.invalid") {
    target = `${fixtureOrigin}/qweather${url.pathname}${url.search}`;
  } else if (url.origin === "https://api.tavily.com" && url.pathname === "/search") {
    target = `${fixtureOrigin}/search`;
  } else {
    throw new Error(`测试拒绝未隔离的 HTTP 请求：${url.origin}`);
  }
  return originalFetch(input instanceof Request ? new Request(target, input) : target, init);
};

try {
  await runAgentTask(taskId, { workerId: "e2e-answer-quality-worker" });
} finally {
  globalThis.fetch = originalFetch;
  await prisma.$disconnect();
}
