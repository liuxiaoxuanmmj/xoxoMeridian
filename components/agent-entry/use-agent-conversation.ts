"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentConversationSnapshot, AgentConversationSendResult } from "@/lib/agent-conversation-types";

export interface PendingConversationMessage {
  principalId: string;
  clientMessageId: string;
  content: string;
  state: "sending" | "failed";
}

type ReadChannel = { activate: (open: boolean) => void; refresh: () => void };
class ConversationSendError extends Error {}

export function useAgentConversation({ principalId, open, onIdentityInvalid, onFeedback }: {
  principalId: string;
  open: boolean;
  onIdentityInvalid: () => void;
  onFeedback: (feedback: "reply" | "failure") => void;
}) {
  const [snapshot, setSnapshot] = useState<AgentConversationSnapshot | null>(null);
  // POST 的已确认事实独立于 GET 生命周期；读取失败也不能丢掉已入库消息。
  const [confirmed, setConfirmed] = useState<AgentConversationSendResult[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingConversationMessage[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [sendFailure, setSendFailure] = useState<{ clientMessageId: string; message: string } | null>(null);
  const [sending, setSending] = useState(false);
  const channel = useRef<ReadChannel | null>(null);
  const lifetime = useRef(0);
  const mutationVersion = useRef(0);
  const mutation = useRef<AbortController | null>(null);
  const knownTasks = useRef(new Map<string, string>());
  const acknowledgedIds = useRef(new Set<string>());

  // 只有这一调度器读取快照。即使传输忽略 abort，关窗/重开也等旧请求 settle。
  useEffect(() => {
    const life = ++lifetime.current;
    let alive = true;
    let panelOpen = false;
    let generation = 0;
    let flight: AbortController | null = null;
    let queued = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const active = () => alive && panelOpen && document.visibilityState !== "hidden";
    const refresh = () => {
      clearTimeout(timer);
      if (!active()) return;
      if (flight) { queued = true; return; }
      const controller = new AbortController();
      flight = controller;
      queued = false;
      const requestGeneration = generation;
      const version = mutationVersion.current;
      const current = () => active() && !controller.signal.aborted && generation === requestGeneration && lifetime.current === life;
      void (async () => {
        try {
          const response = await fetch("/api/agent/conversation", {
            cache: "no-store", credentials: "same-origin", signal: controller.signal,
            headers: { "X-Agent-Viewer-Id": principalId },
          });
          if (!current()) return;
          if (response.status === 401 || response.status === 403) { onIdentityInvalid(); return; }
          if (!response.ok) throw new Error("读取失败");
          const next = await response.json() as AgentConversationSnapshot;
          if (!current()) return;
          if (next.currentUser.id !== principalId) { onIdentityInvalid(); return; }
          // 读取期间发送得到确认，旧快照不能覆盖刚确认的消息与任务。
          if (version !== mutationVersion.current) { queued = true; return; }
          for (const task of next.tasks) {
            const previous = knownTasks.current.get(task.id);
            if (previous && previous !== task.status) {
              if (task.status === "completed") onFeedback("reply");
              if (["failed", "cancelled", "limit_exceeded"].includes(task.status)) onFeedback("failure");
            }
          }
          knownTasks.current = new Map(next.tasks.map((task) => [task.id, task.status]));
          const acceptedIds = new Set(next.messages.flatMap((message) => message.clientMessageId ? [message.clientMessageId] : []));
          acknowledgedIds.current = acceptedIds;
          setSnapshot(next);
          setPending((records) => records.filter((record) => !acceptedIds.has(record.clientMessageId)));
          setSendFailure((failure) => failure && acceptedIds.has(failure.clientMessageId) ? null : failure);
          setConfirmed((records) => records.filter((record) => !next.messages.some((message) =>
            message.id === record.message.id || (message.clientMessageId !== null && message.clientMessageId === record.message.clientMessageId),
          )));
          setReadError(null);
          failures = 0;
        } catch {
          if (current()) { failures += 1; setReadError("暂时无法读取对话，请重试。"); }
        } finally {
          flight = null;
          if (!active()) return;
          if (queued) refresh();
          else timer = setTimeout(refresh, Math.min(15000, 2000 * 2 ** Math.min(failures, 3)));
        }
      })();
    };
    const pause = () => { generation += 1; clearTimeout(timer); queued = false; flight?.abort(); };
    const activate = (next: boolean) => {
      panelOpen = next;
      if (active()) refresh();
      else pause();
    };
    const visibility = () => activate(panelOpen);
    channel.current = { activate, refresh };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      alive = false;
      lifetime.current += 1;
      pause();
      mutation.current?.abort();
      mutation.current = null;
      channel.current = null;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [onFeedback, onIdentityInvalid, principalId]);

  useEffect(() => { channel.current?.activate(open); }, [open, onFeedback, onIdentityInvalid, principalId]);
  const refresh = useCallback(() => { channel.current?.refresh(); }, []);

  const transmit = useCallback(async (record: PendingConversationMessage) => {
    if (mutation.current || record.principalId !== principalId) return;
    const controller = new AbortController();
    mutation.current = controller;
    const life = lifetime.current;
    const current = () => lifetime.current === life && !controller.signal.aborted;
    setSending(true);
    setSendFailure(null);
    setPending((records) => [...records.filter((item) => item.clientMessageId !== record.clientMessageId), { ...record, state: "sending" }]);
    try {
      const response = await fetch("/api/agent/conversation/messages", {
        method: "POST", cache: "no-store", credentials: "same-origin", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-Agent-Viewer-Id": principalId },
        body: JSON.stringify({ clientMessageId: record.clientMessageId, content: record.content }),
      });
      if (!current()) return;
      if (response.status === 401 || response.status === 403) { onIdentityInvalid(); return; }
      if (!response.ok) throw new ConversationSendError(response.status === 409 ? "这条消息的发送标识发生冲突，请重新发送。" : "消息未确认送达，可重试原消息。");
      const accepted = await response.json() as AgentConversationSendResult;
      if (!current()) return;
      if (accepted.currentUserId !== principalId) { onIdentityInvalid(); return; }
      mutationVersion.current += 1;
      knownTasks.current.set(accepted.task.id, accepted.task.status);
      acknowledgedIds.current.add(record.clientMessageId);
      if (acknowledgedIds.current.size > 80) acknowledgedIds.current.delete(acknowledgedIds.current.values().next().value!);
      setConfirmed((records) => [...records.filter((item) => item.message.id !== accepted.message.id), accepted].slice(-80));
      setPending((records) => records.filter((item) => item.clientMessageId !== record.clientMessageId));
      refresh();
    } catch (error) {
      if (!current()) return;
      // GET 可能先于失败的 POST 响应确认入库，不把迟到传输错误降级为未送达。
      if (acknowledgedIds.current.has(record.clientMessageId)) return;
      setPending((records) => records.map((item) => item.clientMessageId === record.clientMessageId ? { ...item, state: "failed" } : item));
      setSendFailure({ clientMessageId: record.clientMessageId, message: error instanceof ConversationSendError ? error.message : "消息未确认送达，可重试原消息。" });
    } finally {
      if (current()) { mutation.current = null; setSending(false); }
    }
  }, [onIdentityInvalid, principalId, refresh]);

  const send = useCallback(() => {
    const content = draft.trim();
    if (!content || mutation.current) return;
    const record: PendingConversationMessage = { principalId, clientMessageId: crypto.randomUUID(), content, state: "sending" };
    // 清空的是本次提交的草稿；迟到的成功不再触碰后来输入的草稿。
    setDraft("");
    void transmit(record);
  }, [draft, principalId, transmit]);

  const messageMap = new Map((snapshot?.messages ?? []).map((message) => [message.id, message]));
  const taskMap = new Map((snapshot?.tasks ?? []).map((task) => [task.id, task]));
  for (const record of confirmed) {
    if (!messageMap.has(record.message.id)) messageMap.set(record.message.id, record.message);
    const existingTask = taskMap.get(record.task.id);
    if (!existingTask || existingTask.updatedAt <= record.task.updatedAt) taskMap.set(record.task.id, record.task);
  }
  const messages = [...messageMap.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).slice(-80);
  const tasks = [...taskMap.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, 80);

  return { snapshot, messages, tasks, draft, setDraft, pending, readError, sendError: sendFailure?.message ?? null, sending, send, retry: transmit, refresh };
}

export type AgentConversationState = ReturnType<typeof useAgentConversation>;
