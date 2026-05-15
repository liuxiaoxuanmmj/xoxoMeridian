import { randomBytes } from "node:crypto";

/**
 * Generate a cryptographically secure random token
 * Used for session tokens, password reset tokens, etc.
 */
export function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}
