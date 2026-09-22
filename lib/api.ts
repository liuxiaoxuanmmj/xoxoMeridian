import { NextResponse } from "next/server";

import { INTERNAL_ERROR_MESSAGE, logInternalError } from "@/lib/internal-error";
import { ValidationError } from "@/lib/validation";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function applyNoStoreHeaders(headers: Headers) {
  headers.set("Cache-Control", "private, no-store, no-cache, max-age=0, must-revalidate");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Accel-Expires", "0");
  headers.append("Vary", "Cookie");
}

export function jsonError(message: string, status = 500, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function errorToResponse(error: unknown) {
  if (error instanceof Response) {
    return error;
  }

  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: "Invalid request", issues: error.issues },
      { status: 400 }
    );
  }

  // 未被识别的异常一律收敛为通用文案：开发与生产返回同一响应，
  // 原始 message、表名、约束名与 stack 只进入带关联标识的受控日志。
  logInternalError("api", error);

  return jsonError(INTERNAL_ERROR_MESSAGE, 500);
}
