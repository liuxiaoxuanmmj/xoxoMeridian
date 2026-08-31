import type { AgentTool, ToolExecutionContext } from "@/agent/types";
import { TRANSIENT_TOOL_RETRY } from "@/agent/tool-errors";

type SearchInput = {
  query: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
};

type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
};

type TavilyResponse = {
  query: string;
  answer?: string;
  results?: TavilySearchResult[];
  response_time?: number;
};

export type SearchOutput = {
  provider: "tavily" | "mock";
  query: string;
  answer?: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    publishedDate?: string;
  }>;
  responseTime?: number;
  fallbackReason?: string;
  _meta?: {
    totalResults: number;
    displayMode?: "inline" | "card" | "collapsed";
  };
};

const FETCH_TIMEOUT_MS = 10000;
const TAVILY_API_URL = "https://api.tavily.com/search";

export async function fetchSearchResults(
  query: string,
  maxResults = 5,
  searchDepth: "basic" | "advanced" = "basic",
  signal?: AbortSignal
): Promise<SearchOutput> {
  let trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new Error("Search query is required.");
  }

  if (trimmedQuery.length > 400) {
    console.warn(`[web.search] query too long (${trimmedQuery.length} chars), truncating to 400`);
    trimmedQuery = trimmedQuery.slice(0, 400);
  }

  const apiKey = process.env.TAVILY_API_KEY ?? "";

  if (!apiKey) {
    console.warn("[web.search] using mock — TAVILY_API_KEY is empty");
    return mockSearch(trimmedQuery, "TAVILY_API_KEY missing");
  }

  try {
    return await callTavilyAPI(
      trimmedQuery,
      Math.min(maxResults, 10),
      searchDepth,
      apiKey,
      signal
    );
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[web.search] Tavily API call failed, falling back to mock: ${reason}`);
    return mockSearch(trimmedQuery, reason);
  }
}

export function createSearchTool(): AgentTool<SearchInput, SearchOutput> {
  return {
    name: "web.search",
    risk: "low",
    retry: TRANSIENT_TOOL_RETRY,
    description:
      "Search the web for real-time information using Tavily API. " +
      "**Use for**: breaking news, local recommendations (restaurants/events/attractions), " +
      "product info, fact-checking, time-sensitive content (exhibitions/movies/concerts). " +
      "**DO NOT use for**: info already in memory/memos, weather (use weather.get), " +
      "personal data, scheduling (use schedule.create), or casual chat. " +
      "Falls back to mock when TAVILY_API_KEY is missing.",
    schema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description:
            "Search query in Chinese or English. Keep it concise (<400 chars), " +
            "use keywords like a search engine, not full sentences. " +
            "Good: '北京三里屯餐厅推荐', '2026年5月新电影'. " +
            "Bad: '你能帮我查一下附近有什么好吃的吗？'"
        },
        maxResults: {
          type: "number",
          description: "Number of results to return (1-10). Default: 5."
        },
        searchDepth: {
          type: "string",
          enum: ["basic", "advanced"],
          description:
            "Search depth. 'basic' (default, 1 credit) for most cases, " +
            "'advanced' (2 credits) for deep research requiring higher relevance."
        }
      }
    },
    async execute(input: SearchInput, context: ToolExecutionContext) {
      const query = input.query?.trim() || "";
      const maxResults = input.maxResults ?? 5;
      const searchDepth = input.searchDepth ?? "basic";

      return fetchSearchResults(query, maxResults, searchDepth, context.signal);
    }
  };
}

function mockSearch(query: string, fallbackReason?: string): SearchOutput {
  return {
    provider: "mock",
    query,
    answer: "这是模拟搜索结果。实际使用需要配置 TAVILY_API_KEY。",
    results: [
      {
        title: "示例结果 1",
        url: "https://example.com/1",
        content: "这是一个模拟的搜索结果内容。在配置 Tavily API key 后，这里会显示真实的搜索结果。",
        score: 0.95
      },
      {
        title: "示例结果 2",
        url: "https://example.com/2",
        content: "模拟搜索结果的第二条内容。",
        score: 0.88
      },
      {
        title: "示例结果 3",
        url: "https://example.com/3",
        content: "模拟搜索结果的第三条内容。",
        score: 0.82
      }
    ],
    fallbackReason,
    _meta: {
      totalResults: 3,
      displayMode: "inline"
    }
  };
}

async function callTavilyAPI(
  query: string,
  maxResults: number,
  searchDepth: "basic" | "advanced",
  apiKey: string,
  signal?: AbortSignal
): Promise<SearchOutput> {
  const controller = signal ? null : new AbortController();
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    : null;

  try {
    const startTime = Date.now();
    const response = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: signal ?? controller?.signal,
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: searchDepth,
        max_results: maxResults,
        include_answer: true,
        include_images: false,
        include_raw_content: false
      })
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");

      if (response.status === 401 || response.status === 403) {
        throw new Error(`API key invalid (${response.status})`);
      }

      if (response.status === 429) {
        throw new Error("Rate limit exceeded");
      }

      throw new Error(`Tavily API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as TavilyResponse;
    const responseTime = (Date.now() - startTime) / 1000;

    return {
      provider: "tavily",
      query: data.query || query,
      answer: data.answer,
      results: (data.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
        publishedDate: r.published_date
      })),
      responseTime,
      _meta: {
        totalResults: data.results?.length || 0,
        displayMode: "inline"
      }
    };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    if (signal?.aborted) throw signal.reason ?? error;

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${FETCH_TIMEOUT_MS}ms`);
    }

    throw error;
  }
}

export const __testing = {
  mockSearch,
  callTavilyAPI
};
