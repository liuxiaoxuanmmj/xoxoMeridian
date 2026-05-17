export function showError(error: unknown, fallback = "操作失败") {
  const message = error instanceof Error ? error.message : String(error);
  alert(`${fallback}：${message}`);
}

export async function submitForm(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<void> {
  const resp = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? `请求失败: ${resp.status}`,
    );
  }
}
