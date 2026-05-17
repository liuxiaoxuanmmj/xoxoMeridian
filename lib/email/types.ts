export type EmailAddress = {
  email: string;
  name?: string;
};

export type EmailPayload = {
  to: EmailAddress | EmailAddress[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: EmailAddress;
};

export type EmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

export interface EmailProvider {
  send(payload: EmailPayload): Promise<EmailResult>;
}
