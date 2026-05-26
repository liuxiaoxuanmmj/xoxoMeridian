import { isLLMAvailable } from "@/lib/llm";
import { checkAndSummarize } from "@/agent/summarizer";
import { checkAndExtractMemories } from "@/agent/memory-extractor";

export function runPostTaskHooks(roomId: string): void {
  if (!isLLMAvailable()) return;

  void Promise.allSettled([
    checkAndSummarize(roomId),
    checkAndExtractMemories(roomId),
  ]).then((results) => {
    for (const r of results) {
      if (r.status === "rejected") {
        console.error("[post-task] hook failed:", r.reason);
      }
    }
  });
}
