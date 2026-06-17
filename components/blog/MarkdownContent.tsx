import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

import { cn } from "@/lib/utils";

const REMARK_PLUGINS = [remarkGfm, remarkBreaks];
const PREVIEW_CHAR_LIMIT = 300;

type MarkdownContentProps = {
  content: string;
  variant?: "detail" | "preview";
};

export const MarkdownContent = memo(function MarkdownContent({
  content,
  variant = "detail",
}: MarkdownContentProps) {
  const displayContent =
    variant === "preview" && content.length > PREVIEW_CHAR_LIMIT
      ? content.slice(0, PREVIEW_CHAR_LIMIT) + "…"
      : content;

  return (
    <div
      className={cn(
        variant === "detail" && "prose max-w-none",
        variant === "preview" &&
          "prose prose-sm mt-2 max-h-[4.875rem] max-w-none overflow-hidden whitespace-pre-wrap text-sm text-black/60 leading-snug prose-headings:my-0 prose-p:my-0 prose-p:text-black/60 prose-strong:text-black/70 prose-ul:my-0 prose-ul:list-disc prose-ul:pl-5 prose-ol:my-0 prose-ol:list-decimal prose-ol:pl-5 prose-li:my-0 prose-li:text-black/60 prose-a:text-[#3a5b22]"
      )}
    >
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
        {displayContent}
      </ReactMarkdown>
    </div>
  );
});
