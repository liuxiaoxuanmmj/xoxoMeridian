import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatPostTime } from "@/lib/posts";
import { AgentTracePanel } from "@/components/blog/AgentTracePanel";

type PostDetailProps = {
  post: {
    id: string;
    slug: string;
    title: string;
    content: string;
    type: string;
    publishedAt: Date;
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
  const metadata = post.metadata;
  const isAgentLog = post.type === "agent_log";

  return (
    <article className="max-w-2xl mx-auto">
      {/* Metadata line */}
      <div className="metadata-mono flex flex-wrap items-center gap-2 mb-6">
        <span>{post.author?.displayName ?? "System"}</span>
        <span aria-hidden="true">&middot;</span>
        <time dateTime={new Date(post.publishedAt).toISOString()}>
          {formatPostTime(new Date(post.publishedAt), post.author?.profile)}
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

      {/* Title */}
      <h1 className="text-3xl font-bold text-black leading-tight mb-8">
        {post.title}
      </h1>

      {/* Content */}
      <div className="prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {post.content}
        </ReactMarkdown>
      </div>

      {/* Agent trace panels */}
      {isAgentLog && metadata && (
        <AgentTracePanel metadata={metadata} />
      )}
    </article>
  );
}
