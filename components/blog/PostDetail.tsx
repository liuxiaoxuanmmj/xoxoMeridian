import Link from "next/link";
import { MarkdownContent } from "@/components/blog/MarkdownContent";
import { formatPostTime, resolveAuthorLocation } from "@/lib/post-time";
import { AgentTracePanel } from "@/components/blog/AgentTracePanel";

type PostDetailProps = {
  post: {
    id: string;
    slug: string;
    title: string;
    content: string;
    type: string;
    publishedAt: Date;
    authorCity?: string | null;
    authorCountry?: string | null;
    authorTimezone?: string | null;
    metadata?: Record<string, unknown> | null;
    author: {
      id: string;
      displayName: string;
      avatarLabel: string;
      profile?: { timezone: string; city: string; country: string } | null;
    } | null;
  };
  isOwner: boolean;
};

export function PostDetail({ post, isOwner }: PostDetailProps) {
  const date = new Date(post.publishedAt);
  const metadata = post.metadata;
  const isAgentLog = post.type === "agent_log";

  return (
    <article className="max-w-2xl mx-auto">
      <Link
        href="/home"
        scroll={false}
        className="inline-flex items-center gap-1.5 text-sm text-black/40 hover:text-[#3a5b22] transition-colors duration-200 mb-6"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Blog
      </Link>

      <div className="metadata-mono flex flex-wrap items-center gap-2 mb-6">
        <span>{post.author?.displayName ?? "System"}</span>
        <span aria-hidden="true">&middot;</span>
        <time dateTime={date.toISOString()}>
          {formatPostTime(date, resolveAuthorLocation(post))}
        </time>
        {isAgentLog && typeof metadata?.taskId === "string" && (
          <>
            <span aria-hidden="true">&middot;</span>
            <span className="text-[#569CD6]">
              trace:{metadata.taskId.slice(0, 12)}
            </span>
          </>
        )}
      </div>

      <h1 className="text-3xl font-bold text-black leading-tight mb-8">
        {post.title}
      </h1>

      <MarkdownContent content={post.content} />

      {/* Agent trace panels */}
      {isAgentLog && metadata && (
        <AgentTracePanel metadata={metadata} />
      )}
    </article>
  );
}
