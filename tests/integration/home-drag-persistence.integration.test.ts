import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH as patchHomeElement } from "@/app/api/home-board/elements/[elementId]/route";
import { prisma } from "@/lib/prisma";
import {
  createTestUser,
  resetTestDatabase,
} from "@/tests/integration/support/database";

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(async () => ({ id: "home-drag-user" })),
}));

const activeObservers = new Set<ChildProcessWithoutNullStreams>();

function startPositionObserver(elementId: string, x: number, y: number, userId: string) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      resolve("tests/integration/fixtures/observe-atlas-element-position.ts"),
      elementId,
      String(x),
      String(y),
      userId,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
    },
  );
  child.stdin.end();
  activeObservers.add(child);

  let stdout = "";
  let stderr = "";
  let ready = false;

  const readyPromise = new Promise<void>((resolveReady, rejectReady) => {
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (!ready && stdout.includes("ready\n")) {
        ready = true;
        resolveReady();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", rejectReady);
    child.once("exit", (code) => {
      if (!ready) {
        rejectReady(new Error(`位置观察者在就绪前退出（${code}）：${stderr || stdout}`));
      }
    });
  });

  const resultPromise = new Promise<{ x: number; y: number }>((resolveResult, rejectResult) => {
    child.once("error", rejectResult);
    child.once("exit", (code) => {
      activeObservers.delete(child);
      if (code !== 0) {
        rejectResult(new Error(`位置观察者退出 ${code}：${stderr || stdout}`));
        return;
      }

      const lines = stdout.trim().split("\n");
      try {
        resolveResult(JSON.parse(lines.at(-1) ?? "{}") as { x: number; y: number });
      } catch (error) {
        rejectResult(new Error(`无法解析位置观察者输出：${stdout}`, { cause: error }));
      }
    });
  });

  return { ready: readyPromise, result: resultPromise };
}

beforeEach(async () => {
  await resetTestDatabase();
});

afterEach(() => {
  for (const observer of activeObservers) {
    observer.kill();
  }
  activeObservers.clear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Home drag persistence", () => {
  it("makes the final PostgreSQL position visible to independent process observers", async () => {
    const user = await createTestUser({ id: "home-drag-user" });
    await prisma.atlasBoard.create({ data: { id: "home-board" } });
    const photo = await prisma.atlasElement.create({
      data: {
        id: "home-drag-photo",
        boardId: "home-board",
        type: "photo",
        x: 10,
        y: 20,
        imageUrl: "/api/atlas/uploads/atlas%2Fhome-drag.jpg",
        createdById: user.id,
      },
    });

    const observers = [
      startPositionObserver(photo.id, 420, 315, user.id),
      startPositionObserver(photo.id, 420, 315, user.id),
    ];
    await Promise.all(observers.map((observer) => observer.ready));

    const response = await patchHomeElement(
      new Request(`http://localhost/api/home-board/elements/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: 420, y: 315 }),
      }),
      { params: Promise.resolve({ elementId: photo.id }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      element: { id: photo.id, x: 420, y: 315 },
    });
    await expect(Promise.all(observers.map((observer) => observer.result))).resolves.toEqual([
      { x: 420, y: 315 },
      { x: 420, y: 315 },
    ]);
    await expect(
      prisma.atlasElement.findUniqueOrThrow({ where: { id: photo.id } }),
    ).resolves.toMatchObject({ x: 420, y: 315 });
  });
});
