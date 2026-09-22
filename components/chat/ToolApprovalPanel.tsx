"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { AgentToolApprovalSummary } from "@/components/chat/types";

interface ToolApprovalPanelProps {
  approvals: AgentToolApprovalSummary[];
  expectedViewerId?: string;
  onComplete?: () => void;
  onIdentityInvalid?: () => void;
}

export function ToolApprovalPanel(props: ToolApprovalPanelProps) {
  return <ApprovalDecisions key={props.expectedViewerId ?? "shared"} {...props} />;
}

function ApprovalDecisions({ approvals, expectedViewerId, onComplete, onIdentityInvalid }: ToolApprovalPanelProps) {
  const router = useRouter();
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const visibleApprovals = approvals.filter((approval) => !dismissedIds.has(approval.id));

  useEffect(() => () => {
    generation.current += 1;
    pending.current?.abort();
  }, []);

  if (visibleApprovals.length === 0) return null;

  const decide = async (
    approval: AgentToolApprovalSummary,
    decision: "approve" | "reject"
  ) => {
    if (pending.current) return;
    const controller = new AbortController();
    const currentGeneration = generation.current;
    const current = () => !controller.signal.aborted && currentGeneration === generation.current;
    pending.current = controller;
    setDecidingId(approval.id);
    setError(null);
    try {
      const response = await fetch(`/api/agent/tasks/${approval.taskId}/approvals`, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(expectedViewerId ? { "X-Agent-Viewer-Id": expectedViewerId } : {}) },
        body: JSON.stringify({ approvalId: approval.id, decision })
      });
      if (!current()) return;
      if (expectedViewerId && (response.status === 401 || response.status === 403)) {
        onIdentityInvalid?.();
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        if (!current()) return;
        throw new Error(payload?.error ?? `审批失败: ${response.status}`);
      }
      setDismissedIds((current) => new Set(current).add(approval.id));
      if (onComplete) onComplete();
      else router.refresh();
    } catch (decisionError) {
      if (current()) setError(decisionError instanceof Error ? decisionError.message : "审批失败");
    } finally {
      if (current()) { pending.current = null; setDecidingId(null); }
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
