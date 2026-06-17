import Link from "next/link";
import { formatPostTime, resolveAuthorLocation } from "@/lib/post-time";
import { MarkdownContent } from "@/components/blog/MarkdownContent";

type PostCardProps = {
  post: {
    id: string;
    slug: string;
    title: string;
    content: string;
    publishedAt: Date | string;
    authorCity?: string | null;
    authorCountry?: string | null;
    authorTimezone?: string | null;
    author: {
      id: string;
      displayName: string;
      avatarLabel: string;
      profile?: { timezone: string; city: string; country: string } | null;
    } | null;
  };
  isOwner: boolean;
};

export function PostCard({ post, isOwner }: PostCardProps) {
  const date = new Date(post.publishedAt);
  return (
    <article className="timeline-card max-w-sm w-full">
      <div className="metadata-mono flex items-center gap-2 mb-2">
        <span>{post.author?.displayName ?? "System"}</span>
        <span aria-hidden="true">&middot;</span>
        <time dateTime={date.toISOString()}>
          {formatPostTime(date, resolveAuthorLocation(post))}
        </time>
      </div>

      <Link href={`/posts/${post.slug}`} className="block group">
        <h2 className="text-lg font-semibold text-black leading-snug group-hover:text-[#3a5b22] transition-colors">
          {post.title}
        </h2>
      </Link>

      {post.content && (
        <MarkdownContent content={post.content} variant="preview" />
      )}

      {isOwner && (
        <div className="mt-3 flex gap-2">
          <Link
            href={`/posts/edit/${post.slug}`}
            className="text-xs text-black/40 hover:text-black transition-colors"
          >
            Edit
          </Link>
        </div>
      )}
    </article>
  );
}
