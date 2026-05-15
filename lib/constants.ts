// Time constants used across the application
export const ONE_MINUTE_MS = 60 * 1000;
export const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
export const ONE_HOUR_MS = 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Rate limit keys
export const RATE_LIMIT_KEYS = {
  LOGIN: "login",
  REGISTER: "register",
  FORGOT_PASSWORD: (email: string) => `forgot-password:${email}`,
  RESET_PASSWORD: "reset-password",
} as const;

// Auth messages
export const AUTH_MESSAGES = {
  PASSWORD_RESET_SENT: "如果该邮箱已注册，您将收到密码重置链接",
  PASSWORD_RESET_SUCCESS: "密码已重置，请使用新密码登录",
} as const;
