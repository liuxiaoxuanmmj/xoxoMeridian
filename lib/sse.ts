export function sse(data: unknown, event = "snapshot"): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
