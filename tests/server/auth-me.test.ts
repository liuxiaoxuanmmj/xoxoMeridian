import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock prisma before importing modules that use it
const { mockProfileUpdate, mockProfileFindUnique, mockUserUpdate } = vi.hoisted(() => ({
  mockProfileUpdate: vi.fn(),
  mockProfileFindUnique: vi.fn(),
  mockUserUpdate: vi.fn(),
}));

const { mockRequireCurrentUser } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: {
      findUnique: mockProfileFindUnique,
      update: mockProfileUpdate,
    },
    user: {
      update: mockUserUpdate,
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        userProfile: { update: mockProfileUpdate },
        user: { update: mockUserUpdate },
      };
      await fn(tx);
    }),
  },
}));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser,
  getCurrentUser: vi.fn(),
}));

vi.mock("city-timezones", () => ({
  lookupViaCity: vi.fn(() => [{ timezone: "Asia/Shanghai", country: "CN" }]),
}));

import { PATCH } from "@/app/api/auth/me/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCurrentUser.mockResolvedValue({
    id: "user-1",
    email: "test@example.com",
    displayName: "Test User",
    avatarLabel: "T",
  });
  mockProfileFindUnique.mockResolvedValue({
    city: "Beijing",
    country: "China",
    timezone: "Asia/Shanghai",
  });
  mockProfileUpdate.mockResolvedValue({});
  mockUserUpdate.mockResolvedValue({});
});

describe("PATCH /api/auth/me", () => {
  it("sets geoSource to manual when city is provided", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: "Shanghai" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          city: "Shanghai",
          geoSource: "manual",
        }),
      }),
    );
  });

  it("sets geoSource to manual when country is provided", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: "Japan" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          country: "Japan",
          geoSource: "manual",
        }),
      }),
    );
  });

  it("does not set geoSource when only profileNote is provided", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileNote: "Hello world" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ geoSource: "manual" }),
      }),
    );
  });

  it("does not set geoSource when only displayName is provided", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "New Name" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockProfileUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ geoSource: "manual" }),
      }),
    );
  });

  it("sets geoSource to manual when both city and country are provided", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: "Tokyo", country: "Japan" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          city: "Tokyo",
          country: "Japan",
          geoSource: "manual",
        }),
      }),
    );
  });
});
