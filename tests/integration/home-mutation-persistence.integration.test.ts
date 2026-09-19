import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH, DELETE as deletePhoto } from "@/app/api/home-board/elements/[elementId]/route";
import { DELETE as deleteConnection } from "@/app/api/home-board/connections/route";
import { getHomeBoardSnapshot } from "@/lib/home-board";
import { prisma } from "@/lib/prisma";
import { createTestUser, resetTestDatabase } from "@/tests/integration/support/database";

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(async () => ({ id: "home-mutation-user" })),
}));

beforeEach(async () => { await resetTestDatabase(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("Home mutation persistence and retry", () => {
  it.each(["resize", "caption", "photo-delete", "connection-delete"] as const)(
    "keeps persisted state after a failed %s and exposes the successful retry in a new snapshot",
    async (operation) => {
      const user = await createTestUser({ id: "home-mutation-user" });
      await prisma.atlasBoard.create({ data: { id: "home-board" } });
      await prisma.atlasElement.createMany({
        data: [1, 2, 3].map((id) => ({
          id: `mutation-photo-${id}`, boardId: "home-board", type: "photo" as const,
          x: id * 20, y: 20, width: 240, height: 180, caption: `照片 ${id}`,
          imageUrl: "/brand/logo_white.svg", createdById: user.id,
        })),
      });
      await prisma.atlasConnection.createMany({
        data: [1, 2].map((id) => ({
          id: `mutation-connection-${id}`, boardId: "home-board",
          fromId: `mutation-photo-${id}`, toId: `mutation-photo-${id + 1}`,
        })),
      });
      const snapshot = async () => {
        const result = await getHomeBoardSnapshot({ boardId: "home-board", userId: user.id });
        // Snapshot 未承诺连线顺序，此处验证记录集合与持久化字段。
        result.elements.sort((a, b) => a.id.localeCompare(b.id));
        result.connections.sort((a, b) => a.id.localeCompare(b.id));
        return result;
      };
      const before = await snapshot();
      const patch = operation === "resize" ? { width: 320, height: 240 } : { caption: "  新标注  " };
      const mutate = () => {
        if (operation === "connection-delete") {
          return deleteConnection(new Request("http://localhost/api/home-board/connections?id=mutation-connection-1", { method: "DELETE" }));
        }
        const params = { params: Promise.resolve({ elementId: "mutation-photo-1" }) };
        const url = "http://localhost/api/home-board/elements/mutation-photo-1";
        return operation === "photo-delete"
          ? deletePhoto(new Request(url, { method: "DELETE" }), params)
          : PATCH(new Request(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }), params);
      };
      const table = operation === "connection-delete" ? "AtlasConnection" : "AtlasElement";
      const verb = operation.endsWith("delete") ? "DELETE" : "UPDATE";
      await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_home_mutation() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'home mutation test failure'; END;
      $$ LANGUAGE plpgsql`);
      try {
        await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_home_mutation BEFORE ${verb} ON "${table}"
          FOR EACH ROW EXECUTE FUNCTION fail_home_mutation()`);
        expect((await mutate()).status).toBe(500);
        expect(await snapshot()).toEqual(before);
      } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_home_mutation ON "${table}"`);
        await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS fail_home_mutation()");
      }

      expect((await mutate()).status).toBe(200);
      const after = await snapshot();
      if (operation.endsWith("delete")) {
        expect(after.connections.map((item) => item.id)).toEqual(["mutation-connection-2"]);
        const expectedPhotoIds = operation === "photo-delete"
          ? ["mutation-photo-2", "mutation-photo-3"]
          : ["mutation-photo-1", "mutation-photo-2", "mutation-photo-3"];
        expect(after.elements.map((item) => item.id).sort()).toEqual(expectedPhotoIds);
        expect((await mutate()).status).toBe(404);
        expect(await snapshot()).toEqual(after);
      } else {
        const expected = operation === "resize" ? patch : { caption: "新标注" };
        expect(after.elements.find((item) => item.id === "mutation-photo-1")).toMatchObject(expected);
        expect(await prisma.atlasElement.findUniqueOrThrow({ where: { id: "mutation-photo-1" } })).toMatchObject(expected);
        expect(after.connections).toEqual(before.connections);
      }
    },
  );
});
