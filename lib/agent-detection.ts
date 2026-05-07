export type AgentDetection =
  | {
      isAgentTargeted: true;
      normalizedContent: string;
      trigger: "mention" | "slash-command" | "explicit-ui";
    }
  | {
      isAgentTargeted: false;
      normalizedContent: string;
      trigger: "none";
    };

const ASSISTANT_MENTIONS = ["@小助手", "@assistant", "@agent"] as const;

// Regex-escape each mention so users typing "@小助手？" or "记得@小助手一下" or
// "@小助手, 查天气" all match. We match the mention itself anywhere in the
// message (not just line start) and allow it to be followed by any character or
// end-of-string. Whitespace/punctuation around the mention is then cleaned up.
// Not using the `g` flag here on purpose — `test()` with `g` keeps `lastIndex`
// state between calls which would flap true/false across invocations.
const MENTION_RE = new RegExp(
  `(${ASSISTANT_MENTIONS.map(escapeRegex).join("|")})`,
  "i"
);

export function detectAgentTarget(content: string, forceAgent = false): AgentDetection {
  const trimmed = content.trim();

  if (forceAgent) {
    return {
      isAgentTargeted: true,
      normalizedContent: stripAllTriggers(trimmed),
      trigger: "explicit-ui"
    };
  }

  if (trimmed.toLowerCase().startsWith("/agent")) {
    return {
      isAgentTargeted: true,
      normalizedContent: trimmed.slice("/agent".length).trim(),
      trigger: "slash-command"
    };
  }

  if (MENTION_RE.test(trimmed)) {
    return {
      isAgentTargeted: true,
      normalizedContent: stripAllTriggers(trimmed),
      trigger: "mention"
    };
  }

  return {
    isAgentTargeted: false,
    normalizedContent: trimmed,
    trigger: "none"
  };
}

function stripAllTriggers(content: string): string {
  let out = content;
  if (out.toLowerCase().startsWith("/agent")) {
    out = out.slice("/agent".length);
  }
  // Drop every @mention occurrence (case-insensitive). We tolerate a trailing
  // whitespace or common Chinese/English punctuation so "@小助手,你好" becomes
  // "你好" rather than ",你好".
  out = out.replace(
    new RegExp(
      `\\s*(${ASSISTANT_MENTIONS.map(escapeRegex).join("|")})[\\s,，。.!？?!]*`,
      "gi"
    ),
    " "
  );
  return out.replace(/\s+/g, " ").trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
