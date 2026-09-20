import { mkdir, readFile, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import sharp from "sharp";

export type AboutPhotoSpec = {
  id: "oo" | "xx";
  publicPath: string;
  alt: string;
};

/** 与 components/about/right-now-content.ts 的交付契约一致：照片位于 public/images/about/。 */
export const ABOUT_PHOTOS: AboutPhotoSpec[] = [
  { id: "oo", publicPath: "/images/about/oo.jpg", alt: "Portrait of oo" },
  { id: "xx", publicPath: "/images/about/xx.jpg", alt: "Portrait of xx" },
];

export function aboutPhotoFile(publicPath: string) {
  return join(process.cwd(), "public", publicPath);
}

export async function aboutPhotoExists(publicPath: string) {
  try {
    return (await stat(aboutPhotoFile(publicPath))).isFile();
  } catch {
    return false;
  }
}

/** 同时匹配静态交付路径与 next/image 优化端点，返回被请求的照片路径。 */
export function matchAboutPhotoRequest(url: string): string | null {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // 无法解码的 URL 保持原样匹配，避免测试自身抛错遮蔽断言。
  }
  return ABOUT_PHOTOS.find((photo) => decoded.includes(photo.publicPath))?.publicPath ?? null;
}

/**
 * E2E 暂存的照片以内容识别，交付方的真实照片不会被误判，
 * 因此删除暂存资源时不会碰到用户照片。
 */
export async function isStagedAboutPhoto(publicPath: string) {
  try {
    return (await readFile(aboutPhotoFile(publicPath))).equals(await temporaryPhotoBytes());
  } catch {
    return false;
  }
}

/**
 * 在交付目录中尚无该照片时写入夹具资源，返回幂等的清理函数；返回 null 表示该路径已被真实照片占用。
 * `next start` 只在启动时快照 public 目录，因此暂存必须发生在被测应用启动之前，运行期写入无法被托管。
 */
export async function stageAboutPhoto(publicPath: string): Promise<(() => Promise<void>) | null> {
  if (await aboutPhotoExists(publicPath)) return null;

  const file = aboutPhotoFile(publicPath);
  const directory = dirname(file);
  const directoryExisted = await pathExists(directory);

  await mkdir(directory, { recursive: true });
  await writeFile(file, await temporaryPhotoBytes());

  return async function removeStagedAboutPhoto() {
    await rm(file, { force: true });
    if (!directoryExisted) await rmdir(directory).catch(() => undefined);
  };
}

/** 清除 E2E 自己暂存的照片以恢复“照片缺失”状态；真实交付照片保持不动。 */
export async function clearStagedAboutPhoto(publicPath: string) {
  if (!(await isStagedAboutPhoto(publicPath))) return false;
  await rm(aboutPhotoFile(publicPath), { force: true });
  return true;
}

async function temporaryPhotoBytes() {
  return sharp({
    create: { width: 640, height: 800, channels: 3, background: { r: 167, g: 196, b: 155 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function pathExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
