import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendEmail, getEmailProvider, createPasswordResetEmail, createWelcomeEmail } from "@/lib/email";
import type { EmailPayload } from "@/lib/email";

// Mock environment variables
vi.mock("@/lib/env", () => ({
  env: {
    EMAIL_PROVIDER: "mock",
    EMAIL_API_KEY: "",
    EMAIL_FROM: "test@example.com",
    APP_BASE_URL: "http://localhost:3000",
  },
}));

describe("Email Templates", () => {
  describe("createPasswordResetEmail", () => {
    it("should create password reset email with correct structure", () => {
      const payload = createPasswordResetEmail({
        email: "user@example.com",
        resetLink: "http://localhost:3000/reset-password?token=abc123",
        expiryHours: 1,
      });

      expect(payload.to).toEqual({ email: "user@example.com" });
      expect(payload.subject).toBe("重置您的密码");
      expect(payload.html).toContain("重置密码");
      expect(payload.html).toContain("http://localhost:3000/reset-password?token=abc123");
      expect(payload.html).toContain("1 小时");
      expect(payload.text).toContain("重置密码");
      expect(payload.text).toContain("http://localhost:3000/reset-password?token=abc123");
    });

    it("should include expiry hours in both HTML and text", () => {
      const payload = createPasswordResetEmail({
        email: "user@example.com",
        resetLink: "http://localhost:3000/reset-password?token=abc123",
        expiryHours: 24,
      });

      expect(payload.html).toContain("24 小时");
      expect(payload.text).toContain("24 小时");
    });
  });

  describe("createWelcomeEmail", () => {
    it("should create welcome email with correct structure", () => {
      const payload = createWelcomeEmail({
        email: "newuser@example.com",
        displayName: "张三",
        loginLink: "http://localhost:3000/login",
      });

      expect(payload.to).toEqual({ email: "newuser@example.com", name: "张三" });
      expect(payload.subject).toBe("欢迎加入 xoxo Meridian");
      expect(payload.html).toContain("张三");
      expect(payload.html).toContain("http://localhost:3000/login");
      expect(payload.text).toContain("张三");
      expect(payload.text).toContain("http://localhost:3000/login");
    });
  });
});

describe("Email Provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("MockProvider", () => {
    it("should send email successfully with mock provider", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const payload: EmailPayload = {
        to: { email: "test@example.com" },
        subject: "Test Subject",
        html: "<p>Test HTML</p>",
        text: "Test Text",
      };

      const result = await sendEmail(payload);

      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^mock-/);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[email] Mock provider - Email would be sent:")
      );

      consoleSpy.mockRestore();
    });

    it("should handle multiple recipients", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const payload: EmailPayload = {
        to: [{ email: "user1@example.com" }, { email: "user2@example.com", name: "User Two" }],
        subject: "Test Subject",
        html: "<p>Test HTML</p>",
      };

      const result = await sendEmail(payload);

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("user1@example.com, user2@example.com"));

      consoleSpy.mockRestore();
    });
  });

  describe("getEmailProvider", () => {
    it("should return the same provider instance on multiple calls", () => {
      const provider1 = getEmailProvider();
      const provider2 = getEmailProvider();

      expect(provider1).toBe(provider2);
    });
  });
});
