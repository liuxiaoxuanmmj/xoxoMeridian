BEGIN;

CREATE TYPE "RoomKind" AS ENUM ('shared', 'agent_private');

ALTER TABLE "Room"
  ADD COLUMN "kind" "RoomKind" NOT NULL DEFAULT 'shared',
  ADD COLUMN "privateOwnerId" TEXT;
CREATE UNIQUE INDEX "Room_privateOwnerId_key" ON "Room"("privateOwnerId");
ALTER TABLE "Room" ADD CONSTRAINT "Room_privateOwnerId_fkey"
  FOREIGN KEY ("privateOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_kind_private_owner_check" CHECK (
  ("kind" = 'shared' AND "privateOwnerId" IS NULL)
  OR ("kind" = 'agent_private' AND "privateOwnerId" IS NOT NULL AND "maxHumanUsers" = 1)
);

-- 可空标识保持旧消息与共享聊天的写入契约；私聊以此键原子地接受重试。
ALTER TABLE "Message" ADD COLUMN "clientMessageId" TEXT;
CREATE UNIQUE INDEX "Message_roomId_senderId_clientMessageId_key"
  ON "Message"("roomId", "senderId", "clientMessageId");

COMMIT;
