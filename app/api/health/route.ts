import { jsonOk } from "@/lib/api";
import { logInternalError } from "@/lib/internal-error";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  let dbError: string | undefined;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (error) {
    // 与其余错误响应同一契约：客户端只得到稳定文案，数据库原因与关联标识只进受控日志，
    // 且不随 NODE_ENV 变化（探测方在开发机与线上看到同一种响应）。
    dbError = "database unavailable";
    logInternalError("health", error);
  }

  return jsonOk(
    {
      ok: dbOk,
      db: dbOk,
      dbError: dbOk ? undefined : dbError,
      checkedInMs: Date.now() - startedAt,
      ts: new Date().toISOString()
    },
    { status: dbOk ? 200 : 503 }
  );
}
