import { expect, type Page } from "@playwright/test";
import { entryName } from "./agent-entry";

export const entryPositionKey = "xoxo:agent-entry:position:default:v1";
export type EntryPosition = { x: number; y: number };

export async function entryBox(page: Page) {
  const box = await page.getByRole("button", { name: entryName }).boundingBox();
  if (!box) throw new Error("可见小人必须具有可操作的页面区域。");
  return box;
}

export async function expectEntryAt(page: Page, expected: EntryPosition) {
  await expect.poll(async () => {
    const current = await entryBox(page);
    return Math.max(Math.abs(current.x - expected.x), Math.abs(current.y - expected.y));
  }).toBeLessThanOrEqual(1);
}

export async function savedEntryPosition(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), entryPositionKey);
}

export async function moveEntryWithMouse(page: Page, target: EntryPosition) {
  const box = await entryBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await page.mouse.move(target.x + box.width / 2, target.y + box.height / 2, { steps: 8 });
  } finally {
    await page.mouse.up();
  }
}

/** CDP 注入 Chromium 的原生触摸输入，覆盖 capture、兼容 click 与 pointercancel。 */
export async function moveEntryWithTouch(page: Page, delta: EntryPosition, cancel = false) {
  const session = await page.context().newCDPSession(page);
  const box = await entryBox(page);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ ...start, id: 1, radiusX: 1, radiusY: 1, force: 1 }],
    });
    for (let step = 1; step <= 8; step += 1) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{
          x: start.x + delta.x * step / 8, y: start.y + delta.y * step / 8,
          id: 1, radiusX: 1, radiusY: 1, force: 1,
        }],
      });
    }
    await session.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
  } finally {
    await session.detach();
  }
}
