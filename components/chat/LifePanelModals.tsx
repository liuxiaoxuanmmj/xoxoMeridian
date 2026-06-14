"use client";

import { useState, useEffect } from "react";
import type { ChatUser, LifeMemo, LifeScheduledJob } from "@/components/chat/types";
import { BaseModal, ModalActions } from "@/components/chat/BaseModal";
import { TimezoneSelector, getDefaultTimezone } from "@/components/chat/TimezoneSelector";
import { CronBuilder } from "@/components/chat/CronBuilder";
import { showError, submitForm } from "@/lib/ui-utils";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  onSuccess: () => void;
};

type MemoModalProps = ModalProps & {
  memo?: LifeMemo;
};

type ScheduledJobModalProps = ModalProps & {
  job?: LifeScheduledJob;
  participants: ChatUser[];
};

export function MemoModal({ isOpen, onClose, roomId, memo, onSuccess }: MemoModalProps) {
  const [busy, setBusy] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    pinned: false,
  });

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      title: memo?.title ?? "",
      content: memo?.content ?? "",
      pinned: memo?.pinned ?? false,
    });
  }, [isOpen, memo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    try {
      const url = memo ? `/api/rooms/${roomId}/memos/${memo.id}` : `/api/rooms/${roomId}/memos`;
      const method = memo ? "PATCH" : "POST";
      await submitForm(url, method, {
        title: formData.title.trim(),
        content: formData.content.trim(),
        pinned: formData.pinned,
      });
      onSuccess();
      onClose();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={memo ? "编辑备忘录" : "新建备忘录"}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-black/70">标题 *</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="mt-1 w-full rounded-[10px] border border-[#d9d9d9] bg-white px-4 py-3 text-[15px] leading-normal transition-colors duration-200 focus:border-[#3a5b22] focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none"
            required
            maxLength={200}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-black/70">内容 *</label>
          <textarea
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            className="mt-1 w-full rounded-[10px] border border-[#d9d9d9] bg-white px-4 py-3 text-[15px] leading-normal transition-colors duration-200 focus:border-[#3a5b22] focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none"
            rows={5}
            required
            maxLength={8000}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="pinned"
            checked={formData.pinned}
            onChange={(e) => setFormData({ ...formData, pinned: e.target.checked })}
            className="h-4 w-4 rounded border-warm-300 text-sage-600 focus:ring-sage-500"
          />
          <label htmlFor="pinned" className="text-sm font-medium text-black/70">
            置顶
          </label>
        </div>
        <ModalActions busy={busy} onCancel={onClose} />
      </form>
    </BaseModal>
  );
}

export function ScheduledJobModal({
  isOpen,
  onClose,
  roomId,
  job,
  participants,
  onSuccess,
}: ScheduledJobModalProps) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"once" | "recurring">("recurring");
  const [formData, setFormData] = useState({
    description: "",
    prompt: "",
    fireAt: "",
    cron: "0 9 * * *",
    timezone: getDefaultTimezone(participants),
  });

  useEffect(() => {
    if (!isOpen) return;
    const isOnce = !!(job?.payload?.runOnce);
    setMode(isOnce ? "once" : "recurring");
    setFormData({
      description: (job?.payload?.description as string | null) ?? "",
      prompt: (job?.payload?.prompt as string | null) ?? "",
      fireAt: job?.nextRunAt ? new Date(job.nextRunAt).toISOString().slice(0, 16) : "",
      cron: job?.cron ?? "0 9 * * *",
      timezone: job?.timezone ?? getDefaultTimezone(participants),
    });
  }, [isOpen, job, participants]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        prompt: formData.prompt.trim(),
        description: formData.description.trim() || null,
        timezone: formData.timezone,
      };

      if (mode === "once") {
        if (!formData.fireAt) {
          showError("请选择执行时间");
          setBusy(false);
          return;
        }
        payload.fireAt = new Date(formData.fireAt).toISOString();
        payload.runOnce = true;
      } else {
        payload.cron = formData.cron;
        payload.runOnce = false;
      }

      if (job) {
        await submitForm(`/api/rooms/${roomId}/scheduled-jobs/${job.id}`, "PATCH", payload);
      } else {
        await submitForm(`/api/rooms/${roomId}/scheduled-jobs`, "POST", payload);
      }

      onSuccess();
      onClose();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleModeChange = (next: "once" | "recurring") => {
    setMode(next);
    setFormData({
      description: "",
      prompt: "",
      fireAt: "",
      cron: "0 9 * * *",
      timezone: formData.timezone, // 保留时区设置
    });
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={job ? "编辑任务" : "新建任务"}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleModeChange("once")}
            className={`flex-1 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors duration-200 cursor-pointer ${
              mode === "once"
                ? "bg-[#3a5b22]/10 text-[#3a5b22]"
                : "bg-[#fafbfc] text-black/60 hover:bg-neutral-100"
            }`}
          >
            一次性任务
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("recurring")}
            className={`flex-1 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors duration-200 cursor-pointer ${
              mode === "recurring"
                ? "bg-sage-100 text-sage-700"
                : "bg-[#fafbfc] text-black/60 hover:bg-neutral-100"
            }`}
          >
            周期任务
          </button>
        </div>
        <div>
          <label className="block text-sm font-medium text-black/70">任务描述</label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="mt-1 w-full rounded-[10px] border border-[#d9d9d9] bg-white px-4 py-3 text-[15px] leading-normal transition-colors duration-200 focus:border-[#3a5b22] focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none"
            placeholder="例如：每天早上的问候"
            maxLength={200}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-black/70">执行指令 *</label>
          <textarea
            value={formData.prompt}
            onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
            className="mt-1 w-full rounded-[10px] border border-[#d9d9d9] bg-white px-4 py-3 text-[15px] leading-normal transition-colors duration-200 focus:border-[#3a5b22] focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none"
            rows={3}
            required
            maxLength={500}
            placeholder="例如：@助手 给对方发一条早安问候"
          />
        </div>
        {mode === "once" ? (
          <div>
            <label className="block text-sm font-medium text-black/70">执行时间 *</label>
            <input
              type="datetime-local"
              value={formData.fireAt}
              onChange={(e) => setFormData({ ...formData, fireAt: e.target.value })}
              className="mt-1 w-full rounded-[10px] border border-[#d9d9d9] bg-white px-4 py-3 text-[15px] leading-normal transition-colors duration-200 focus:border-[#3a5b22] focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none"
              required
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-black/70">执行周期</label>
            <div className="mt-1">
              <CronBuilder
                value={formData.cron}
                onChange={(cron) => setFormData({ ...formData, cron })}
              />
            </div>
          </div>
        )}
        <TimezoneSelector
          value={formData.timezone}
          onChange={(tz) => setFormData({ ...formData, timezone: tz })}
          participants={participants}
        />
        <ModalActions busy={busy} onCancel={onClose} />
      </form>
    </BaseModal>
  );
}
