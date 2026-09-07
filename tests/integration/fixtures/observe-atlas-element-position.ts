import { getHomeBoardSnapshot, HOME_BOARD_ID } from "../../../lib/home-board";
import { prisma } from "../../../lib/prisma";

const [elementId, expectedXValue, expectedYValue] = process.argv.slice(2);
const expectedX = Number(expectedXValue);
const expectedY = Number(expectedYValue);

if (!elementId || !Number.isFinite(expectedX) || !Number.isFinite(expectedY)) {
  throw new Error("elementId、expectedX 与 expectedY 都是必需参数");
}

async function readPosition() {
  const snapshot = await getHomeBoardSnapshot(HOME_BOARD_ID);
  const element = snapshot.elements.find((candidate) => candidate.id === elementId);
  if (!element) {
    throw new Error(`Home board 中不存在元素 ${elementId}`);
  }
  return { x: element.x, y: element.y };
}

async function main() {
  const initial = await readPosition();

  if (initial.x === expectedX && initial.y === expectedY) {
    throw new Error("观察者启动前坐标已经是目标值，无法证明跨进程最终收敛");
  }

  process.stdout.write("ready\n");
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const position = await readPosition();

    if (position.x === expectedX && position.y === expectedY) {
      process.stdout.write(`${JSON.stringify(position)}\n`);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`等待元素 ${elementId} 收敛到 (${expectedX}, ${expectedY}) 超时`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
