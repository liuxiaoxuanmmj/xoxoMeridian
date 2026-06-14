import Link from "next/link";
import { formatPostTime } from "@/lib/posts";

type AgentLogCardProps = {
  post: {
    id: string;
    slug: string;
    title: string;
    publishedAt: Date;
    metadata?: Record<string, unknown> | null;
  };
};

function getString(m: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = m?.[key];
  return typeof v === "string" ? v : null;
}

export function AgentLogCard({ post }: AgentLogCardProps) {
  const m = post.metadata;
  const taskId = getString(m, "taskId");

  return (
    <article className="terminal-card max-w-sm w-full">
      <div className="flex items-center gap-2 mb-3 text-[#808080] text-xs">
        <span className="text-[#4EC9B0]">$</span>
        <span>agent.log</span>
        <time dateTime={new Date(post.publishedAt).toISOString()} className="metadata-mono text-[#808080]">
          {formatPostTime(new Date(post.publishedAt))}
        </time>
        {taskId && (
          <span className="ml-auto text-[#569CD6] font-mono text-[10px]">
            trace:{taskId.slice(0, 8)}
          </span>
        )}
      </div>

      <Link
        href={`/posts/${post.slug}`}
        className="block text-[#D4D4D4] hover:text-white transition-colors"
      >
        <h2 className="font-semibold leading-snug">{post.title}</h2>
      </Link>

      {(["thought", "action", "observation"] as const)
        .map((key) => ({ key, value: getString(m, key) }))
        .filter(({ value }) => value)
        .map(({ key, value }, i) => (
          <details key={key} className={i === 0 ? "mt-3" : "mt-2"}>
            <summary className="text-[#4EC9B0] text-xs cursor-pointer select-none">
              {key}
            </summary>
            <p className="mt-1 text-xs text-[#808080] leading-relaxed pl-2 border-l border-[#333]">
              {value}
            </p>
          </details>
        ))}
    </article>
  );
}
