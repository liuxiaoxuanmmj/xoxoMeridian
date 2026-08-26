import { HttpResponse, http } from "msw";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { LoginForm } from "@/components/auth/LoginForm";
import { mockServer } from "@/tests/mocks/server";

describe("LoginForm", () => {
  it("submits credentials and renders the API error", async () => {
    let submittedBody: unknown;
    mockServer.use(
      http.post("http://localhost:3000/api/auth/login", async ({ request }) => {
        submittedBody = await request.json();
        return HttpResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
      })
    );
    const user = userEvent.setup();

    render(<LoginForm onSwitchToRegister={() => undefined} />);
    await user.type(screen.getByLabelText("邮箱"), "alice@example.com");
    await user.type(screen.getByLabelText("密码"), "not-the-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("邮箱或密码错误")).toBeInTheDocument();
    expect(submittedBody).toEqual({
      email: "alice@example.com",
      password: "not-the-password",
    });
  });
});
