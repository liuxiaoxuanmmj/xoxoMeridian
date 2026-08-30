import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MessageComposer } from "@/components/chat/MessageComposer";

const currentUser = {
  id: "user-1",
  displayName: "Alice",
  avatarLabel: "A",
};

describe("MessageComposer", () => {
  it("resets the editor when a new external draft arrives", () => {
    const onSubmitMessage = vi.fn();
    const { rerender } = render(
      <MessageComposer
        currentUser={currentUser}
        externalDraft="第一条草稿"
        onSubmitMessage={onSubmitMessage}
      />
    );

    expect(screen.getByLabelText("消息内容")).toHaveValue("第一条草稿");

    rerender(
      <MessageComposer
        currentUser={currentUser}
        externalDraft="第二条草稿"
        onSubmitMessage={onSubmitMessage}
      />
    );

    expect(screen.getByLabelText("消息内容")).toHaveValue("第二条草稿");
  });

  it("prevents duplicate sends while a request is pending and clears on success", async () => {
    let resolveSubmit: ((result: { ok: true }) => void) | undefined;
    const onSubmitMessage = vi.fn(
      () => new Promise<{ ok: true }>((resolve) => {
        resolveSubmit = resolve;
      })
    );
    const user = userEvent.setup();

    render(
      <MessageComposer
        currentUser={currentUser}
        onSubmitMessage={onSubmitMessage}
      />
    );

    await user.type(screen.getByLabelText("消息内容"), "你好");
    const sendButton = screen.getByRole("button", { name: "发送" });
    await user.click(sendButton);

    expect(onSubmitMessage).toHaveBeenCalledTimes(1);
    expect(onSubmitMessage).toHaveBeenCalledWith("你好");
    expect(sendButton).toBeDisabled();

    resolveSubmit?.({ ok: true });
    await waitFor(() => {
      expect(screen.getByLabelText("消息内容")).toHaveValue("");
    });
  });
});
