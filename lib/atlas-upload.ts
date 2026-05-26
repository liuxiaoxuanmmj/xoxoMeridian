import { mkdir, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const ATLAS_UPLOAD_DIR = process.env.ATLAS_UPLOAD_DIR || "data/atlas-uploads";

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

export async function saveUploadedImage(
  file: File
): Promise<{ filename: string; path: string }> {
  if (!ALLOWED_MIMES.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}`);
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${file.size} bytes (max ${MAX_FILE_SIZE})`);
  }

  await mkdir(ATLAS_UPLOAD_DIR, { recursive: true });

  const ext = file.name.split(".").pop() ?? "jpg";
  const filename = `${randomUUID()}-${sanitizeFilename(file.name.replace(/\.[^.]+$/, ""))}.${ext}`;
  const filepath = join(ATLAS_UPLOAD_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  return { filename, path: filepath };
}

export async function deleteUploadedImage(filename: string): Promise<void> {
  const filepath = join(ATLAS_UPLOAD_DIR, filename);
  try {
    await unlink(filepath);
  } catch {
    // File might already be deleted
  }
}

export function getUploadPath(filename: string): string {
  return join(ATLAS_UPLOAD_DIR, filename);
}
