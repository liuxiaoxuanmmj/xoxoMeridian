/**
 * 非预期异常的单点收口：客户端只应看到这里定义的稳定文案，
 * 失败原因与关联标识只进入服务端日志。
 *
 * 有意不按 NODE_ENV 分支：开发与生产对客户端是同一份契约，
 * 否则错误内容会变成隐式的客户端契约，且开发机上的响应无法代表线上。
 */
export const INTERNAL_ERROR_MESSAGE = "Internal server error";

/**
 * 记录一次内部异常并返回本次失败的关联标识。
 *
 * 日志只写入异常自身的 message 与 stack——不写请求体、表单字段、查询参数、
 * 凭据或任何由用户提供的内容；调用方也不要把这些内容拼进 message。
 * scope 沿用既有日志前缀语义（API 用 `[api]`，Action 用 `[createPost]` 等）。
 */
export function logInternalError(scope: string, error: unknown): string {
  const correlationId = globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? "" : "";

  console.error(`[${scope}] unhandled error (id=${correlationId}):`, message, stack);

  return correlationId;
}
