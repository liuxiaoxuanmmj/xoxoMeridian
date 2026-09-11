import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const createTransport = vi.fn();

describe("SMTP email provider", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMail.mockReset().mockResolvedValue({ messageId: "smtp-message-id" });
    createTransport.mockReset().mockReturnValue({ sendMail });

    vi.doMock("nodemailer", () => ({
      default: { createTransport },
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        EMAIL_PROVIDER: "smtp",
        EMAIL_API_KEY: "",
        EMAIL_FROM: "XOXO Meridian <noreply@example.com>",
        TURBOSMTP_CONSUMER_KEY: "",
        TURBOSMTP_CONSUMER_SECRET: "",
        TURBOSMTP_REGION: "us",
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: 465,
        SMTP_SECURE: true,
        SMTP_USER: "smtp-user",
        SMTP_PASSWORD: "smtp-password",
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock("nodemailer");
    vi.doUnmock("@/lib/env");
  });

  it("creates the configured transport and sends the public payload", async () => {
    const { sendEmail } = await import("@/lib/email/provider");

    const result = await sendEmail({
      to: [
        { email: "one@example.com" },
        { email: "two@example.com", name: "收件人二" },
      ],
      subject: "SMTP compatibility",
      html: "<p>Hello</p>",
      text: "Hello",
      replyTo: { email: "reply@example.com", name: "回复地址" },
    });

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      auth: {
        user: "smtp-user",
        pass: "smtp-password",
      },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "XOXO Meridian <noreply@example.com>",
      to: ["one@example.com", "收件人二 <two@example.com>"],
      subject: "SMTP compatibility",
      html: "<p>Hello</p>",
      text: "Hello",
      replyTo: "回复地址 <reply@example.com>",
    });
    expect(result).toEqual({ success: true, messageId: "smtp-message-id" });
  });
});
