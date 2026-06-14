// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreatePost, mockUpdatePost, mockDeletePost, mockPush, mockBack } = vi.hoisted(() => ({
  mockCreatePost: vi.fn(),
  mockUpdatePost: vi.fn(),
  mockDeletePost: vi.fn(),
  mockPush: vi.fn(),
  mockBack: vi.fn(),
}));

vi.mock("@/app/actions/posts", () => ({
  createPost: mockCreatePost,
  updatePost: mockUpdatePost,
  deletePost: mockDeletePost,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

(globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
  React: typeof React;
}).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as typeof globalThis & { React: typeof React }).React = React;

import { PostEditor } from "@/components/blog/PostEditor";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("PostEditor", () => {
  it("does not submit again while the create action is still pending", async () => {
    let resolveCreate: (value: { post: { id: string; slug: string; title: string } }) => void;
    mockCreatePost.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );

    await act(async () => {
      root.render(
        React.createElement(PostEditor, {
          currentUser: { id: "user-1", displayName: "Alice", avatarLabel: "A" },
        })
      );
    });

    const title = container.querySelector("input")!;
    const content = container.querySelector("textarea")!;
    const form = container.querySelector("form")!;

    await act(async () => {
      title.value = "My Post";
      title.dispatchEvent(new Event("input", { bubbles: true }));
      content.value = "Body";
      content.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => {});

    await act(async () => {
      form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    });

    expect(mockCreatePost).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate!({ post: { id: "post-1", slug: "my-post", title: "My Post" } });
    });
  });
});
