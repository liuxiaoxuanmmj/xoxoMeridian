import { requireCurrentUser } from "@/lib/auth";
import type { AtlasStorageReadResult } from "@/lib/storage/atlas-storage";
import { getAtlasStorage } from "@/lib/storage/atlas-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isStorageNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: unknown; status?: unknown; statusCode?: unknown };
  return (
    err.code === "ENOENT" ||
    err.code === "NoSuchKey" ||
    err.status === 404 ||
    err.statusCode === 404
  );
}

export async function GET(
  _request: Request,
  { params }: { params: { filename: string } }
) {
  try {
    await requireCurrentUser();

    let key: string;
    try {
      key = decodeURIComponent(params.filename);
    } catch {
      return new Response("Not found", { status: 404 });
    }

    let result: AtlasStorageReadResult;
    try {
      result = await getAtlasStorage().read(key);
    } catch (err: unknown) {
      if (isStorageNotFoundError(err)) {
        return new Response("Not found", { status: 404 });
      }
      throw err;
    }

    const buffer = result.body;
    const body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "private, max-age=86400",
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response("Internal error", { status: 500 });
  }
}
