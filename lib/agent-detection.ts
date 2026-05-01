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

const ASSISTANT_MENTIONS = ["@小助手", "@assistant", "@agent"];

export function detectAgentTarget(content: string, forceAgent = false): AgentDetection {
  const trimmed = content.trim();

  if (forceAgent) {
    return {
      isAgentTargeted: true,
      normalizedContent: stripKnownAgentPrefix(trimmed),
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

  const mention = ASSISTANT_MENTIONS.find((item) => trimmed.toLowerCase().startsWith(item.toLowerCase()));
  if (mention) {
    return {
      isAgentTargeted: true,
      normalizedContent: trimmed.slice(mention.length).trim(),
      trigger: "mention"
    };
  }

  return {
    isAgentTargeted: false,
    normalizedContent: trimmed,
    trigger: "none"
  };
}

function stripKnownAgentPrefix(content: string) {
  const slash = content.toLowerCase().startsWith("/agent") ? content.slice("/agent".length).trim() : content;
  const mention = ASSISTANT_MENTIONS.find((item) => slash.toLowerCase().startsWith(item.toLowerCase()));
  return mention ? slash.slice(mention.length).trim() : slash;
}
