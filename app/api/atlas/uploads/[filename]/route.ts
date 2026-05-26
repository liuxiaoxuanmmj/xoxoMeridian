import { requireCurrentUser } from "@/lib/auth";
import { getUploadPath } from "@/lib/atlas-upload";
import { readFile } from "node:fs/promises";

export const dynamic = "force-dynamic";

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: { filename: string } }
) {
  try {
    await requireCurrentUser();

    const filepath = getUploadPath(params.filename);
    const ext = params.filename.split(".").pop()?.toLowerCase() ?? "jpg";
    const contentType = MIME_MAP[ext] ?? "application/octet-stream";

    let buffer: Buffer;
    try {
      buffer = await readFile(filepath);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
        return new Response("Not found", { status: 404 });
      }
      throw err;
    }

    const body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response("Internal error", { status: 500 });
  }
}
