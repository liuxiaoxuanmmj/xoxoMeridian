"use client";

import { Users } from "lucide-react";

type TimerState = "idle" | "running" | "paused";
type TimerMode = "focus" | "short" | "long";

export type StudyMember = {
  userId: string;
  displayName: string;
  avatarLabel: string;
  online: boolean;
  studyStatus: {
    state: TimerState;
    mode: TimerMode;
    expectedEndAt: string | null;
    lastStudySeenAt: string | null;
  } | null;
  todayFocusMinutes: number;
};

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function StudyMemberRow({ member }: { member: StudyMember }) {
  const isFocusing = member.studyStatus?.state === "running";
  const statusLabel = isFocusing ? "专注中" : member.online ? "在线" : "离线";

  return (
    <div className="flex items-center gap-3 py-2.5">
      {/* Avatar */}
      <div className="relative shrink-0">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${
            isFocusing
              ? "bg-sage-100 text-[#3a5b22]"
              : "bg-sage-100/70 text-sage-700/60"
          }`}
        >
          {member.avatarLabel}
        </div>
        {/* Online/Focusing indicator */}
        {isFocusing ? (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#3a5b22] border-2 border-white flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          </div>
        ) : member.online ? (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
        ) : (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-gray-300 border-2 border-white" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-black truncate">
          {member.displayName}
        </p>
        <p className="text-[11px] text-black/40">
          {statusLabel}
          {member.todayFocusMinutes > 0 && (
            <span> · {formatMinutes(member.todayFocusMinutes)}</span>
          )}
        </p>
      </div>

      {/* Focus indicator for running members */}
      {isFocusing && (
        <div className="shrink-0 w-2 h-2 rounded-full bg-[#3a5b22] animate-pulse" />
      )}
    </div>
  );
}

export function StudyRoomMembers({
  members,
}: {
  members: StudyMember[];
}) {
  const onlineCount = members.filter((m) => m.online).length;

  return (
    <section className="rounded-[10px] border border-sage-100 bg-white/90 p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xs font-semibold text-black/50 uppercase tracking-wider">
          学习伙伴
        </h2>
        <span className="flex items-center gap-1 text-[10px] text-black/30">
          <Users className="w-3 h-3" />
          {onlineCount}/{members.length}
        </span>
      </div>

      <div className="divide-y divide-sage-100">
        {members.length === 0 ? (
          <p className="text-xs text-black/30 py-4 text-center">
            暂无学习伙伴
          </p>
        ) : (
          members.map((member) => (
            <StudyMemberRow key={member.userId} member={member} />
          ))
        )}
      </div>
    </section>
  );
}
