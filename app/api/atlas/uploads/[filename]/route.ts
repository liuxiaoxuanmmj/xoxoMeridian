import { requireCurrentUser } from "@/lib/auth";
import type { AtlasStorageReadResult } from "@/lib/storage/atlas-storage";
import { getAtlasStorage, isAtlasStorageNotFoundError } from "@/lib/storage/atlas-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    await requireCurrentUser();
    const { filename } = await params;

    let key: string;
    try {
      key = decodeURIComponent(filename);
    } catch {
      return new Response("Not found", { status: 404 });
    }

    let result: AtlasStorageReadResult;
    try {
      result = await getAtlasStorage().read(key);
    } catch (err: unknown) {
      if (isAtlasStorageNotFoundError(err)) {
        return new Response("Not found", { status: 404 });
      }
      throw err;
    }

    const buffer = result.body;
    const body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Length": String(buffer.length),
        "Vary": "Cookie",
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response("Internal error", { status: 500 });
  }
}
