export type ChatUser = {
  id: string;
  displayName: string;
  avatarLabel: string;
  profile?: {
    city: string;
    country: string;
    timezone: string;
    preferences?: unknown;
  } | null;
};

export type ChatMessage = {
  id: string;
  roomId: string;
  senderId?: string | null;
  senderAgentId?: string | null;
  senderType: "human" | "agent" | "system";
  content: string;
  targetType: "all" | "user" | "agent";
  targetId?: string | null;
  status: "sent" | "processing" | "failed";
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  sender?: Pick<ChatUser, "id" | "displayName" | "avatarLabel"> | null;
  senderAgent?: {
    id: string;
    displayName: string;
    slug: string;
  } | null;
  finalTask?: {
    id: string;
    status: "pending" | "running" | "completed" | "failed";
    toolCalls?: Array<{
      id: string;
      toolName: string;
      status: string;
      durationMs?: number | null;
      error?: string | null;
    }>;
    llmCalls?: Array<{
      id: string;
      provider: string;
      model: string;
      status: string;
      totalTokens?: number | null;
    }>;
  } | null;
  sourceTask?: {
    id: string;
    status: string;
  } | null;
};


export type LifeMemo = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
};

export type LifeScheduledJob = {
  id: string;
  cron: string;
  timezone: string;
  nextRunAt: string;
  payload?: Record<string, unknown> | null;
};

export type RoomSummary = {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type RoomSnapshot = {
  room: {
    id: string;
    name: string;
    participants: Array<{
      user: ChatUser;
    }>;
  };
  messages: ChatMessage[];
  memos: LifeMemo[];
  scheduledJobs: LifeScheduledJob[];
  agentStatus: {
    isWorking: boolean;
    runningTasks: number;
    recentTasks: Array<{
      id: string;
      status: "pending" | "running" | "completed" | "failed";
      createdAt: string;
      error?: string | null;
    }>;
  };
  rooms?: RoomSummary[];
};
