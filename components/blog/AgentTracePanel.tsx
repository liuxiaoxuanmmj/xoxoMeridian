"use client";

export function AgentTracePanel({ metadata }: { metadata: Record<string, unknown> }) {
  const sections = [
    { key: "thought", label: "thought", color: "#4EC9B0" },
    { key: "action", label: "action", color: "#569CD6" },
    { key: "observation", label: "observation", color: "#CE9178" },
  ];

  return (
    <div className="mt-10 space-y-3">
      <h2 className="text-xs font-medium text-black/40 uppercase tracking-wider">
        Agent Trace
      </h2>
      {sections.map(({ key, label, color }) => {
        const value = metadata[key];
        if (!value || typeof value !== "string") return null;
        return (
          <details key={key} className="terminal-card" open>
            <summary
              className="cursor-pointer select-none text-sm font-medium"
              style={{ color }}
            >
              {label}
            </summary>
            <pre className="mt-3 text-xs text-[#D4D4D4] whitespace-pre-wrap leading-relaxed">
              {value}
            </pre>
          </details>
        );
      })}
    </div>
  );
}
