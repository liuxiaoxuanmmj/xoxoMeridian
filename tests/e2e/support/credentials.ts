export const E2E_INVITE_CODE = process.env.E2E_INVITE_CODE ?? "xoxo-e2e-invite";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "e2e-password-2026";

export const E2E_USERS = [
  {
    email: "e2e-one@example.com",
    displayName: "E2E One",
    storageState: "test-results/.auth/user-one.json",
  },
  {
    email: "e2e-two@example.com",
    displayName: "E2E Two",
    storageState: "test-results/.auth/user-two.json",
  },
] as const;
