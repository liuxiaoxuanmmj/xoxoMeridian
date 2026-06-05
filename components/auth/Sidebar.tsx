"use client";

export function Sidebar() {
  return (
    <aside className="flex h-full flex-col border-r border-[#e8e8e8] bg-[#fafbfc] px-6 py-10">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#3a5b22] text-base font-bold text-white">
          X
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-black">XOXO</p>
          <p className="text-xs font-medium leading-tight text-black/50">Meridian</p>
        </div>
      </div>

      <p className="mt-6 text-sm font-medium leading-relaxed text-black/60">
        一个只属于两个人的异地聊天室
      </p>

      <div className="mt-auto pt-8">
        <p className="text-[10px] leading-relaxed text-black/30">
          消息、备忘录、提醒事项和 Agent 执行链路都会落库。小助手运行在同一台服务器上。
        </p>
      </div>
    </aside>
  );
}
