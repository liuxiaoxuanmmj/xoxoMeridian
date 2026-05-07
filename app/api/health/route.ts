import { jsonOk } from "@/lib/api";
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
    dbError = error instanceof Error ? error.message : String(error);
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
