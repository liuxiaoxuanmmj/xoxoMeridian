import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DELETE as deleteAtlasElement,
  PATCH as patchAtlasElement,
} from "@/app/api/atlas/elements/[elementId]/route";
import { DELETE as deleteAtlasConnection } from "@/app/api/atlas/connections/route";
import { prisma } from "@/lib/prisma";
import {
  createTestUser,
  resetTestDatabase,
} from "@/tests/integration/support/database";

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(async () => ({ id: "atlas-board-scope-user" })),
}));

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createBoardFixtures() {
  const user = await createTestUser({ id: "atlas-board-scope-user" });
  const post = await prisma.post.create({
    data: {
      slug: "home-anchor-scope",
      title: "Home anchor scope",
      content: "Persistent post content",
      authorId: user.id,
      publishedAt: new Date("2026-09-07T00:00:00.000Z"),
    },
  });

  await prisma.atlasBoard.createMany({
    data: [
      { id: "atlas-global-board" },
      { id: "home-board" },
    ],
  });

  const homeAnchor = await prisma.atlasElement.create({
    data: {
      id: "home-post-anchor",
      boardId: "home-board",
      type: "note",
      postId: post.id,
      x: 128,
      y: 256,
      rotation: 4,
      zIndex: 17,
      width: 360,
      height: 240,
      createdById: user.id,
    },
  });
  const homePhoto = await prisma.atlasElement.create({
    data: {
      id: "home-photo",
      boardId: "home-board",
      type: "photo",
      x: 480,
      y: 320,
      imageUrl: "/api/atlas/uploads/atlas%2Fhome-scope.jpg",
      createdById: user.id,
    },
  });
  const homeConnection = await prisma.atlasConnection.create({
    data: {
      id: "home-connection",
      boardId: "home-board",
      fromId: homeAnchor.id,
      toId: homePhoto.id,
      color: "#668a5b",
    },
  });

  const globalElementOne = await prisma.atlasElement.create({
    data: {
      id: "global-note-one",
      boardId: "atlas-global-board",
      type: "note",
      x: 10,
      y: 20,
      content: "Global note one",
      createdById: user.id,
    },
  });
  const globalElementTwo = await prisma.atlasElement.create({
    data: {
      id: "global-note-two",
      boardId: "atlas-global-board",
      type: "note",
      x: 30,
      y: 40,
      content: "Global note two",
      createdById: user.id,
    },
  });
  const globalConnection = await prisma.atlasConnection.create({
    data: {
      id: "global-connection",
      boardId: "atlas-global-board",
      fromId: globalElementOne.id,
      toId: globalElementTwo.id,
    },
  });

  return {
    post,
    homeAnchor,
    homeConnection,
    globalElementOne,
    globalConnection,
  };
}

describe("Atlas mutation board scope", () => {
  it("keeps Home post layout and connection intact when legacy Atlas mutations target their ids", async () => {
    const fixtures = await createBoardFixtures();

    const patchResponse = await patchAtlasElement(
      new Request("http://localhost/api/atlas/elements/home-post-anchor", {
        method: "PATCH",
        body: JSON.stringify({ x: 999, y: 999, zIndex: 1 }),
      }),
      { params: Promise.resolve({ elementId: fixtures.homeAnchor.id }) },
    );
    const deleteConnectionResponse = await deleteAtlasConnection(
      new Request(`http://localhost/api/atlas/connections?id=${fixtures.homeConnection.id}`, {
        method: "DELETE",
      }),
    );
    const deleteElementResponse = await deleteAtlasElement(
      new Request("http://localhost/api/atlas/elements/home-post-anchor", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ elementId: fixtures.homeAnchor.id }) },
    );

    expect(patchResponse.status).toBe(404);
    expect(deleteElementResponse.status).toBe(404);
    expect(deleteConnectionResponse.status).toBe(404);
    await expect(
      prisma.atlasElement.findUniqueOrThrow({ where: { id: fixtures.homeAnchor.id } }),
    ).resolves.toMatchObject({
      boardId: "home-board",
      postId: fixtures.post.id,
      x: 128,
      y: 256,
      rotation: 4,
      zIndex: 17,
      width: 360,
      height: 240,
    });
    await expect(
      prisma.atlasConnection.findUnique({ where: { id: fixtures.homeConnection.id } }),
    ).resolves.toMatchObject({
      boardId: "home-board",
      fromId: fixtures.homeAnchor.id,
      toId: "home-photo",
    });
    await expect(
      prisma.post.findUnique({ where: { id: fixtures.post.id } }),
    ).resolves.toMatchObject({
      title: "Home anchor scope",
      content: "Persistent post content",
    });
  });

  it("still updates and deletes elements and connections on the global Atlas board", async () => {
    const fixtures = await createBoardFixtures();

    const patchResponse = await patchAtlasElement(
      new Request("http://localhost/api/atlas/elements/global-note-one", {
        method: "PATCH",
        body: JSON.stringify({ x: 64, y: 96 }),
      }),
      { params: Promise.resolve({ elementId: fixtures.globalElementOne.id }) },
    );
    const deleteConnectionResponse = await deleteAtlasConnection(
      new Request(`http://localhost/api/atlas/connections?id=${fixtures.globalConnection.id}`, {
        method: "DELETE",
      }),
    );
    const deleteElementResponse = await deleteAtlasElement(
      new Request("http://localhost/api/atlas/elements/global-note-one", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ elementId: fixtures.globalElementOne.id }) },
    );

    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      element: { id: fixtures.globalElementOne.id, x: 64, y: 96 },
    });
    expect(deleteConnectionResponse.status).toBe(200);
    expect(deleteElementResponse.status).toBe(200);
    await expect(
      prisma.atlasConnection.findUnique({ where: { id: fixtures.globalConnection.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.atlasElement.findUnique({ where: { id: fixtures.globalElementOne.id } }),
    ).resolves.toBeNull();
  });
});
