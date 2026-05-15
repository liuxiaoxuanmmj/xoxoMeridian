import { AGENT_DISPLAY_NAME } from "@/lib/identity";
import { cn } from "@/lib/utils";

export function AgentStatusBadge({ isWorking, latestStatus }: { isWorking: boolean; latestStatus?: string }) {
  const label = isWorking
    ? latestStatus === "pending"
      ? `${AGENT_DISPLAY_NAME}正在理解任务`
      : `${AGENT_DISPLAY_NAME}正在调用工具`
    : latestStatus === "failed"
      ? `${AGENT_DISPLAY_NAME}执行失败`
      : `${AGENT_DISPLAY_NAME}已就绪`;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        isWorking ? "border-warm-200 bg-warm-100 text-warm-700" : "border-sage-100 bg-sage-50 text-sage-700"
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", isWorking ? "animate-pulse bg-warm-500" : "bg-sage-500")} />
      {label}
    </div>
  );
}
