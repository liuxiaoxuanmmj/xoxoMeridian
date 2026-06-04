import { Resend } from "resend";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "@/lib/env";
import type { EmailProvider, EmailPayload, EmailResult, EmailAddress } from "./types";

// Utility functions
function formatEmailAddress(addr: EmailAddress): string {
  return addr.name ? `${addr.name} <${addr.email}>` : addr.email;
}

function normalizeRecipients(to: EmailAddress | EmailAddress[]): EmailAddress[] {
  return Array.isArray(to) ? to : [to];
}

function handleProviderError(error: unknown, providerName: string): EmailResult {
  console.error(`[email] ${providerName} exception:`, error);
  return {
    success: false,
    error: error instanceof Error ? error.message : "Unknown error",
  };
}

class ResendProvider implements EmailProvider {
  private client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async send(payload: EmailPayload): Promise<EmailResult> {
    try {
      const to = normalizeRecipients(payload.to);
      const response = await this.client.emails.send({
        from: env.EMAIL_FROM,
        to: to.map(formatEmailAddress),
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        replyTo: payload.replyTo ? formatEmailAddress(payload.replyTo) : undefined,
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
      return handleProviderError(error, "Resend");
    }
  }
}

class TurboSMTPProvider implements EmailProvider {
  private consumerKey: string;
  private consumerSecret: string;
  private apiUrl: string;

  constructor(consumerKey: string, consumerSecret: string, region: "us" | "eu" = "us") {
    this.consumerKey = consumerKey;
    this.consumerSecret = consumerSecret;
    this.apiUrl =
      region === "eu"
        ? "https://api.eu.turbo-smtp.com/api/v2/mail/send"
        : "https://api.turbo-smtp.com/api/v2/mail/send";
  }

  async send(payload: EmailPayload): Promise<EmailResult> {
    try {
      const to = normalizeRecipients(payload.to);
      const toEmails = to.map((addr) => addr.email).join(",");

      const requestBody = {
        from: env.EMAIL_FROM,
        to: toEmails,
        subject: payload.subject,
        html_content: payload.html,
        content: payload.text || undefined,
        reply_to: payload.replyTo?.email || undefined,
      };

      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          consumerKey: this.consumerKey,
          consumerSecret: this.consumerSecret,
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("[email] TurboSMTP error:", response.status, result);
        return {
          success: false,
          error: result.message || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return {
        success: true,
        messageId: result.messageID || result.message_id,
      };
    } catch (error) {
      return handleProviderError(error, "TurboSMTP");
    }
  }
}

class MockProvider implements EmailProvider {
  async send(payload: EmailPayload): Promise<EmailResult> {
    const to = normalizeRecipients(payload.to);
    const recipients = to.map((addr) => addr.email).join(", ");

    console.log("[email] Mock provider - Email would be sent:", {
      from: env.EMAIL_FROM,
      to: recipients,
      subject: payload.subject,
      htmlLength: payload.html.length,
      textLength: payload.text?.length,
    });

    return {
      success: true,
      messageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
  }
}

class SMTPProvider implements EmailProvider {
  private transporter: Transporter;

  constructor(host: string, port: number, secure: boolean, user: string, password: string) {
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure, // true for 465, false for other ports
      auth: {
        user,
        pass: password,
      },
    });
  }

  async send(payload: EmailPayload): Promise<EmailResult> {
    try {
      const to = normalizeRecipients(payload.to);

      const mailOptions = {
        from: env.EMAIL_FROM,
        to: to.map(formatEmailAddress),
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        replyTo: payload.replyTo ? formatEmailAddress(payload.replyTo) : undefined,
      };

      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      return handleProviderError(error, "SMTP");
    }
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
  } else if (provider === "turbosmtp") {
    if (!env.TURBOSMTP_CONSUMER_KEY || !env.TURBOSMTP_CONSUMER_SECRET) {
      console.warn(
        "[email] EMAIL_PROVIDER=turbosmtp but TURBOSMTP_CONSUMER_KEY or TURBOSMTP_CONSUMER_SECRET is empty. Falling back to mock provider."
      );
      providerInstance = new MockProvider();
    } else {
      const region = (env.TURBOSMTP_REGION?.toLowerCase() === "eu" ? "eu" : "us") as "us" | "eu";
      providerInstance = new TurboSMTPProvider(
        env.TURBOSMTP_CONSUMER_KEY,
        env.TURBOSMTP_CONSUMER_SECRET,
        region
      );
    }
  } else if (provider === "smtp") {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
      console.warn(
        "[email] EMAIL_PROVIDER=smtp but SMTP_HOST, SMTP_USER, or SMTP_PASSWORD is empty. Falling back to mock provider."
      );
      providerInstance = new MockProvider();
    } else {
      providerInstance = new SMTPProvider(
        env.SMTP_HOST,
        env.SMTP_PORT,
        env.SMTP_SECURE,
        env.SMTP_USER,
        env.SMTP_PASSWORD
      );
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
