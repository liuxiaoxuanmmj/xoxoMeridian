export { sendEmail, getEmailProvider } from "./provider";
export { createPasswordResetEmail, createWelcomeEmail } from "./templates";
export type { EmailProvider, EmailPayload, EmailResult, EmailAddress } from "./types";
export type { PasswordResetEmailData, WelcomeEmailData } from "./templates";
