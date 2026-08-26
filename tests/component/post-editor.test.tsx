import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { PostEditor } from "@/components/blog/PostEditor";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PostEditor", () => {
  it("does not submit again while the create action is pending", async () => {
    let resolveCreate: (value: { post: { id: string; slug: string; title: string } }) => void;
    mockCreatePost.mockImplementation(
      () => new Promise((resolve) => {
        resolveCreate = resolve;
      })
    );
    const user = userEvent.setup();

    render(
      <PostEditor currentUser={{ id: "user-1", displayName: "Alice", avatarLabel: "A" }} />
    );
    await user.type(screen.getByLabelText("Post title"), "My Post");
    await user.type(screen.getByLabelText("Post content"), "Body");

    const submit = screen.getByRole("button", { name: "Publish" });
    await user.click(submit);
    await user.click(submit);

    expect(mockCreatePost).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();

    resolveCreate!({ post: { id: "post-1", slug: "my-post", title: "My Post" } });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/posts/my-post");
    });
  });
});
