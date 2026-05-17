import { Resend } from "resend";
import { env } from "@/lib/env";
import type { EmailProvider, EmailPayload, EmailResult, EmailAddress } from "./types";

class ResendProvider implements EmailProvider {
  private client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async send(payload: EmailPayload): Promise<EmailResult> {
    try {
      const to = Array.isArray(payload.to) ? payload.to : [payload.to];
      const response = await this.client.emails.send({
        from: env.EMAIL_FROM,
        to: to.map((addr) => (addr.name ? `${addr.name} <${addr.email}>` : addr.email)),
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        replyTo: payload.replyTo
          ? payload.replyTo.name
            ? `${payload.replyTo.name} <${payload.replyTo.email}>`
            : payload.replyTo.email
          : undefined,
      });

      if (response.error) {
        console.error("[email] Resend error:", response.error);
        return {
          success: false,
          error: response.error.message || "Unknown Resend error",
        };
      }

      return {
        success: true,
        messageId: response.data?.id,
      };
    } catch (error) {
      console.error("[email] Resend exception:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

class MockProvider implements EmailProvider {
  async send(payload: EmailPayload): Promise<EmailResult> {
    const to = Array.isArray(payload.to) ? payload.to : [payload.to];
    const recipients = to.map((addr) => addr.email).join(", ");

    console.log("[email] Mock provider - Email would be sent:");
    console.log(`  From: ${env.EMAIL_FROM}`);
    console.log(`  To: ${recipients}`);
    console.log(`  Subject: ${payload.subject}`);
    console.log(`  HTML length: ${payload.html.length} chars`);
    if (payload.text) {
      console.log(`  Text length: ${payload.text.length} chars`);
    }

    return {
      success: true,
      messageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
  }
}

let providerInstance: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (providerInstance) {
    return providerInstance;
  }

  const provider = env.EMAIL_PROVIDER.toLowerCase();

  if (provider === "resend") {
    if (!env.EMAIL_API_KEY) {
      console.warn(
        "[email] EMAIL_PROVIDER=resend but EMAIL_API_KEY is empty. Falling back to mock provider."
      );
      providerInstance = new MockProvider();
    } else {
      providerInstance = new ResendProvider(env.EMAIL_API_KEY);
    }
  } else {
    providerInstance = new MockProvider();
  }

  return providerInstance;
}

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const provider = getEmailProvider();
  return provider.send(payload);
}
