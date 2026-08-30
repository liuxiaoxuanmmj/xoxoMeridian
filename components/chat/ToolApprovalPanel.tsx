"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AgentToolApprovalSummary } from "@/components/chat/types";

export function ToolApprovalPanel({
  approvals
}: {
  approvals: AgentToolApprovalSummary[];
}) {
  const router = useRouter();
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const visibleApprovals = approvals.filter((approval) => !dismissedIds.has(approval.id));

  if (visibleApprovals.length === 0) return null;

  const decide = async (
    approval: AgentToolApprovalSummary,
    decision: "approve" | "reject"
  ) => {
    if (decidingId) return;
    setDecidingId(approval.id);
    setError(null);
    try {
      const response = await fetch(`/api/agent/tasks/${approval.taskId}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: approval.id, decision })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? `审批失败: ${response.status}`);
      }
      setDismissedIds((current) => new Set(current).add(approval.id));
      router.refresh();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "审批失败");
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <section
      aria-label="待审批的 Agent 操作"
      className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2">
        {visibleApprovals.map((approval) => (
          <div
            key={approval.id}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p>
              助手请求执行高风险操作：
              <span className="font-semibold">{describeApproval(approval)}</span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={decidingId !== null}
                onClick={() => void decide(approval, "reject")}
                className="rounded-[8px] border border-amber-300 bg-white px-3 py-1.5 font-medium disabled:opacity-50"
              >
                拒绝
              </button>
              <button
                type="button"
                disabled={decidingId !== null}
                onClick={() => void decide(approval, "approve")}
                className="rounded-[8px] bg-amber-800 px-3 py-1.5 font-medium text-white disabled:opacity-50"
              >
                批准并执行
              </button>
            </div>
          </div>
        ))}
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </section>
  );
}

function describeApproval(approval: AgentToolApprovalSummary) {
  if (approval.toolName === "memo.delete") {
    const memoId = typeof approval.input.memoId === "string"
      ? approval.input.memoId
      : "未知备忘录";
    return `永久删除备忘录 ${memoId}`;
  }
  return approval.toolName;
}
