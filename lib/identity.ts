// Single source of truth for assistant identity strings.
//
// Why: previously these were sprinkled as raw "@小助手" / "小助手" literals
// across UI components, agent prompts, and server routes. Renaming or
// localizing meant grepping through dozens of files.
//
// User display names (the two humans in a room) are NOT here — those come
// from `User.displayName` and are user-controlled at registration time.

export const AGENT_SLUG = "life-assistant";
export const AGENT_DISPLAY_NAME = "小助手";
export const MENTION_AGENT = "@小助手";
