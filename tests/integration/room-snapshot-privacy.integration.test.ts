import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { getRoomSnapshot } from "@/lib/room-snapshot";
import {
  createTestRoom,
  createTestUser,
  resetTestDatabase,
} from "@/tests/integration/support/database";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Room snapshot participant privacy", () => {
  it("returns only the public participant fields needed by Chat and Study", async () => {
    const [viewer, partner] = await Promise.all([
      createTestUser({
        id: "snapshot-viewer",
        email: "snapshot-viewer-private@example.com",
        displayName: "Snapshot Viewer",
        avatarLabel: "SV",
        passwordHash: "snapshot-viewer-private-password-hash",
      }),
      createTestUser({
        id: "snapshot-partner",
        email: "snapshot-partner-private@example.com",
        displayName: "Snapshot Partner",
        avatarLabel: "SP",
        passwordHash: "snapshot-partner-private-password-hash",
      }),
    ]);
    const room = await createTestRoom({ id: "snapshot-private-room" });

    await Promise.all([
      prisma.userProfile.create({
        data: {
          userId: viewer.id,
          city: "Public City One",
          country: "Public Country One",
          timezone: "Asia/Tokyo",
          lastGeoIp: "198.51.100.11",
          preferences: { privateMarker: "viewer-private-preferences" },
          profileNote: "viewer-private-profile-note",
        },
      }),
      prisma.userProfile.create({
        data: {
          userId: partner.id,
          city: "Public City Two",
          country: "Public Country Two",
          timezone: "Asia/Seoul",
          lastGeoIp: "198.51.100.12",
          preferences: { privateMarker: "partner-private-preferences" },
          profileNote: "partner-private-profile-note",
        },
      }),
      prisma.roomParticipant.createMany({
        data: [
          { roomId: room.id, userId: viewer.id, role: "owner" },
          { roomId: room.id, userId: partner.id, role: "member" },
        ],
      }),
    ]);

    const snapshot = await getRoomSnapshot(room.id, viewer.id);

    expect(snapshot.room?.participants.map((participant) => participant.user)).toEqual([
      {
        id: viewer.id,
        displayName: "Snapshot Viewer",
        avatarLabel: "SV",
        profile: {
          city: "Public City One",
          country: "Public Country One",
          timezone: "Asia/Tokyo",
        },
        studyStatus: null,
      },
      {
        id: partner.id,
        displayName: "Snapshot Partner",
        avatarLabel: "SP",
        profile: {
          city: "Public City Two",
          country: "Public Country Two",
          timezone: "Asia/Seoul",
        },
        studyStatus: null,
      },
    ]);

    const serialized = JSON.stringify(snapshot);
    for (const privateField of [
      "email",
      "passwordHash",
      "sessionVersion",
      "lastGeoIp",
      "lastGeoCheck",
      "preferences",
      "profileNote",
    ]) {
      expect(serialized).not.toContain(`\"${privateField}\"`);
    }
    for (const privateValue of [
      "snapshot-viewer-private@example.com",
      "snapshot-partner-private@example.com",
      "snapshot-viewer-private-password-hash",
      "snapshot-partner-private-password-hash",
      "viewer-private-preferences",
      "partner-private-preferences",
      "viewer-private-profile-note",
      "partner-private-profile-note",
      "198.51.100.11",
      "198.51.100.12",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });
});
