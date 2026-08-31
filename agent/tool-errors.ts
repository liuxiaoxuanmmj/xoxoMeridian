import type { ToolErrorCategory, ToolRetryPolicy } from "@/agent/types";

const TRANSIENT_NODE_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT"
]);
const TRANSIENT_PRISMA_CODES = new Set(["P1001", "P1002", "P2024", "P2034"]);
const TIMEOUT_PRISMA_CODES = new Set(["P2028"]);

export const NO_TOOL_RETRY: ToolRetryPolicy = {
  maxAttempts: 1,
  backoffMs: 0,
  retryOn: []
};

export const TRANSIENT_TOOL_RETRY: ToolRetryPolicy = {
  maxAttempts: 3,
  backoffMs: 100,
  retryOn: ["timeout", "network"]
};

export class ToolExecutionError extends Error {
  constructor(
    message: string,
    readonly category: ToolErrorCategory,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ToolExecutionError";
  }
}

export class ToolTimeoutError extends ToolExecutionError {
  constructor(readonly toolName: string, readonly timeoutMs: number) {
    super(
      `Tool ${toolName} timed out after ${timeoutMs}ms.`,
      "timeout",
      true
    );
    this.name = "ToolTimeoutError";
  }
}

export class ToolValidationError extends ToolExecutionError {
  constructor(
    readonly toolName: string,
    readonly direction: "input" | "output",
    readonly issues: Array<{ path: string; code: string; message: string }>
  ) {
    super(
      `Tool ${toolName} ${direction} validation failed: ${issues
        .map((issue) => `${issue.path || "(root)"}: ${issue.message}`)
        .join("; ")}`,
      "validation",
      false
    );
    this.name = "ToolValidationError";
  }
}

export function classifyToolError(error: unknown): ToolExecutionError {
  if (error instanceof ToolExecutionError) return error;

  const code = readErrorCode(error);
  if (code && TIMEOUT_PRISMA_CODES.has(code)) {
    return new ToolExecutionError(
      error instanceof Error ? error.message : `Tool transaction timed out (${code}).`,
      "timeout",
      true,
      { cause: error }
    );
  }
  if (code && (TRANSIENT_NODE_CODES.has(code) || TRANSIENT_PRISMA_CODES.has(code))) {
    return new ToolExecutionError(
      error instanceof Error ? error.message : `Transient Tool failure (${code}).`,
      "network",
      true,
      { cause: error }
    );
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new ToolExecutionError(error.message || "Tool request aborted.", "timeout", true, {
      cause: error
    });
  }

  return new ToolExecutionError(
    error instanceof Error ? error.message : "Tool execution failed.",
    "tool",
    false,
    { cause: error }
  );
}

function readErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}
