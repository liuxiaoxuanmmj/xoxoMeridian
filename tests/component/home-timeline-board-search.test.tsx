import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockServer } from "@/tests/mocks/server";

const navigation = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => navigation.searchParams,
}));

vi.mock("@/components/blog/Timeline", () => ({
  Timeline: ({
    posts,
    emptyMessage,
  }: {
    posts: Array<{ id: string; title: string }>;
    emptyMessage?: string;
  }) => (
    <section>
      {posts.map((post) => <p key={post.id}>{post.title}</p>)}
      {emptyMessage ? <p>{emptyMessage}</p> : null}
    </section>
  ),
}));

vi.mock("@/components/home/HomeSpatialLayer", () => ({
  HomeSpatialLayer: () => null,
}));

vi.mock("@/components/home/HomeUploadModal", () => ({
  HomeUploadModal: () => null,
}));

import { HomeTimelineBoard } from "@/components/home/HomeTimelineBoard";

const initialPost = {
  id: "post-1",
  slug: "initial",
  title: "Initial post",
  content: "Initial content",
  type: "user_post",
  authorId: "user-1",
  publishedAt: "2026-08-27T00:00:00.000Z",
  author: { id: "user-1", displayName: "Alice", avatarLabel: "A" },
};

const searchPost = {
  ...initialPost,
  id: "post-2",
  slug: "matched",
  title: "Matched post",
};

const initialSnapshot = {
  boardId: "board-1",
  elements: [],
  connections: [],
};

describe("HomeTimelineBoard search", () => {
  beforeEach(() => {
    navigation.searchParams = new URLSearchParams();
  });

  it("shows initial posts while loading and then renders the matching response", async () => {
    navigation.searchParams = new URLSearchParams("q=matched");
    mockServer.use(
      http.get("/api/posts", () => HttpResponse.json({ posts: [searchPost] }))
    );

    render(
      <HomeTimelineBoard
        posts={[initialPost]}
        currentUserId="user-1"
        initialSnapshot={initialSnapshot}
      />
    );

    expect(screen.getByText("Initial post")).toBeInTheDocument();
    expect(await screen.findByText("Matched post")).toBeInTheDocument();
    expect(screen.queryByText("Initial post")).not.toBeInTheDocument();
  });

  it("shows the search empty state after an empty response", async () => {
    navigation.searchParams = new URLSearchParams("q=missing");
    mockServer.use(
      http.get("/api/posts", () => HttpResponse.json({ posts: [] }))
    );

    render(
      <HomeTimelineBoard
        posts={[initialPost]}
        currentUserId="user-1"
        initialSnapshot={initialSnapshot}
      />
    );

    expect(
      await screen.findByText("No posts match your search.")
    ).toBeInTheDocument();
  });
});
