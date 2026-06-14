import Link from "next/link";
import { formatPostTime } from "@/lib/post-time";

type PostCardProps = {
  post: {
    id: string;
    slug: string;
    title: string;
    content: string;
    publishedAt: Date | string;
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
  return (
    <article className="timeline-card max-w-sm w-full">
      <div className="metadata-mono flex items-center gap-2 mb-2">
        <span>{post.author?.displayName ?? "System"}</span>
        <span aria-hidden="true">&middot;</span>
        <time dateTime={new Date(post.publishedAt).toISOString()}>
          {formatPostTime(new Date(post.publishedAt), post.author?.profile)}
        </time>
      </div>

      <Link href={`/posts/${post.slug}`} className="block group">
        <h2 className="text-lg font-semibold text-black leading-snug group-hover:text-[#3a5b22] transition-colors">
          {post.title}
        </h2>
      </Link>

      {post.content && (
        <p className="mt-2 text-sm text-black/60 leading-relaxed line-clamp-3">
          {post.content.slice(0, 150)}
          {post.content.length > 150 ? "…" : ""}
        </p>
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
