import { jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

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
    // In production, hide internal error details to prevent information leakage
    if (env.NODE_ENV === "production") {
      dbError = "database unavailable";
      console.error("[Health] Database error:", error);
    } else {
      dbError = error instanceof Error ? error.message : String(error);
    }
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
