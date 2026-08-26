import { mkdir } from "node:fs/promises";

import { expect, request, test as setup } from "@playwright/test";

import { E2E_INVITE_CODE, E2E_PASSWORD, E2E_USERS } from "./support/credentials";

setup("provisions two authenticated users through same-origin registration", async ({ baseURL }) => {
  if (!baseURL) {
    throw new Error("Playwright baseURL is required for authenticated E2E setup");
  }

  await mkdir("test-results/.auth", { recursive: true });

  for (const user of E2E_USERS) {
    const context = await request.newContext({
      baseURL,
      extraHTTPHeaders: { origin: baseURL },
    });
    const response = await context.post("/api/auth/register", {
      data: {
        email: user.email,
        password: E2E_PASSWORD,
        displayName: user.displayName,
        inviteCode: E2E_INVITE_CODE,
        timezone: "Asia/Shanghai",
      },
    });
    expect(response.status()).toBe(200);
    await context.storageState({ path: user.storageState });
    await context.dispose();
  }
});
