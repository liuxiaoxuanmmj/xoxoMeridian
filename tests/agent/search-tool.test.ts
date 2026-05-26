import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSearchTool, fetchSearchResults, __testing } from "@/agent/tools/search-tool";
import type { ToolExecutionContext } from "@/agent/types";

const { mockSearch, callTavilyAPI } = __testing;

describe("search-tool", () => {
  const originalEnv = process.env.TAVILY_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.TAVILY_API_KEY = originalEnv;
  });

  describe("createSearchTool", () => {
    it("should create a tool with correct name and description", () => {
      const tool = createSearchTool();
      expect(tool.name).toBe("web.search");
      expect(tool.description).toContain("Search the web");
      expect(tool.description).toContain("Tavily API");
    });

    it("should have required schema fields", () => {
      const tool = createSearchTool();
      expect(tool.schema).toMatchObject({
        type: "object",
        required: ["query"],
        properties: {
          query: expect.objectContaining({ type: "string" }),
          maxResults: expect.objectContaining({ type: "number" }),
          searchDepth: expect.objectContaining({ type: "string", enum: ["basic", "advanced"] })
        }
      });
    });
  });

  describe("fetchSearchResults", () => {
    it("should return mock when TAVILY_API_KEY is missing", async () => {
      process.env.TAVILY_API_KEY = "";
      const result = await fetchSearchResults("test query");

      expect(result.provider).toBe("mock");
      expect(result.query).toBe("test query");
      expect(result.fallbackReason).toBe("TAVILY_API_KEY missing");
      expect(result.results).toHaveLength(3);
    });

    it("should truncate query longer than 400 chars", async () => {
      process.env.TAVILY_API_KEY = "";
      const longQuery = "a".repeat(500);
      const result = await fetchSearchResults(longQuery);

      expect(result.query).toBe("a".repeat(400));
    });

    it("should throw error for empty query", async () => {
      await expect(fetchSearchResults("")).rejects.toThrow("Search query is required");
      await expect(fetchSearchResults("   ")).rejects.toThrow("Search query is required");
    });

    it("should apply default maxResults and searchDepth", async () => {
      process.env.TAVILY_API_KEY = "";
      const result = await fetchSearchResults("test");

      expect(result.provider).toBe("mock");
    });

    it("should cap maxResults at 10", async () => {
      process.env.TAVILY_API_KEY = "test-key";
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          query: "test",
          results: []
        })
      } as Response);

      await fetchSearchResults("test", 20);

      const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(callBody.max_results).toBe(10);

      fetchSpy.mockRestore();
    });
  });

  describe("mockSearch", () => {
    it("should return mock data with fallback reason", () => {
      const result = mockSearch("test query", "API key invalid");

      expect(result).toMatchObject({
        provider: "mock",
        query: "test query",
        answer: expect.stringContaining("模拟搜索结果"),
        fallbackReason: "API key invalid",
        results: expect.arrayContaining([
          expect.objectContaining({
            title: expect.any(String),
            url: expect.any(String),
            content: expect.any(String),
            score: expect.any(Number)
          })
        ])
      });
      expect(result.results).toHaveLength(3);
    });
  });

  describe("callTavilyAPI", () => {
    it("should call Tavily API with correct parameters", async () => {
      const mockResponse = {
        query: "test query",
        answer: "Test answer",
        results: [
          {
            title: "Result 1",
            url: "https://example.com/1",
            content: "Content 1",
            score: 0.95,
            published_date: "2025-05-20"
          }
        ],
        response_time: 1.23
      };

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await callTavilyAPI("test query", 5, "basic", "test-api-key");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.tavily.com/search",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: "test-api-key",
            query: "test query",
            search_depth: "basic",
            max_results: 5,
            include_answer: true,
            include_images: false,
            include_raw_content: false
          })
        })
      );

      expect(result).toMatchObject({
        provider: "tavily",
        query: "test query",
        answer: "Test answer",
        results: [
          {
            title: "Result 1",
            url: "https://example.com/1",
            content: "Content 1",
            score: 0.95,
            publishedDate: "2025-05-20"
          }
        ],
        responseTime: expect.any(Number)
      });

      fetchSpy.mockRestore();
    });

    it("should throw error on 401 Unauthorized", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized"
      } as Response);

      await expect(callTavilyAPI("test", 5, "basic", "invalid-key")).rejects.toThrow(
        "API key invalid (401)"
      );

      fetchSpy.mockRestore();
    });

    it("should throw error on 429 Rate Limit", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Too Many Requests"
      } as Response);

      await expect(callTavilyAPI("test", 5, "basic", "test-key")).rejects.toThrow(
        "Rate limit exceeded"
      );

      fetchSpy.mockRestore();
    });

    it("should throw error on network timeout", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          }, 100);
        });
      });

      await expect(callTavilyAPI("test", 5, "basic", "test-key")).rejects.toThrow(
        "Request timeout"
      );

      fetchSpy.mockRestore();
    });

    it("should handle advanced search depth", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ query: "test", results: [] })
      } as Response);

      await callTavilyAPI("test", 5, "advanced", "test-key");

      const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(callBody.search_depth).toBe("advanced");

      fetchSpy.mockRestore();
    });
  });

  describe("tool.execute", () => {
    it("should execute with valid input", async () => {
      process.env.TAVILY_API_KEY = "";
      const tool = createSearchTool();
      const mockContext = {} as ToolExecutionContext;

      const result = await tool.execute(
        { query: "test query", maxResults: 3, searchDepth: "basic" },
        mockContext
      );

      expect(result.provider).toBe("mock");
      expect(result.query).toBe("test query");
    });

    it("should use default values for optional parameters", async () => {
      process.env.TAVILY_API_KEY = "";
      const tool = createSearchTool();
      const mockContext = {} as ToolExecutionContext;

      const result = await tool.execute({ query: "test" }, mockContext);

      expect(result.provider).toBe("mock");
      expect(result.query).toBe("test");
    });

    it("should trim query input", async () => {
      process.env.TAVILY_API_KEY = "";
      const tool = createSearchTool();
      const mockContext = {} as ToolExecutionContext;

      const result = await tool.execute({ query: "  test query  " }, mockContext);

      expect(result.query).toBe("test query");
    });
  });

  describe("error handling and fallback", () => {
    it("should fallback to mock on API error", async () => {
      process.env.TAVILY_API_KEY = "test-key";
      const fetchSpy = vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

      const result = await fetchSearchResults("test query");

      expect(result.provider).toBe("mock");
      expect(result.fallbackReason).toContain("Network error");

      fetchSpy.mockRestore();
    });

    it("should fallback to mock on 500 server error", async () => {
      process.env.TAVILY_API_KEY = "test-key";
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error"
      } as Response);

      const result = await fetchSearchResults("test query");

      expect(result.provider).toBe("mock");
      expect(result.fallbackReason).toContain("500");

      fetchSpy.mockRestore();
    });
  });
});
