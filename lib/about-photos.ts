import "server-only";

import { statSync } from "node:fs";
import { join } from "node:path";

/** About 页照片的展示契约：src 为 null 表示尚未交付照片，界面改用内置回退。 */
export type AboutPhoto = {
  src: string | null;
  alt: string;
};

export type AboutPhotoSource = {
  imageSrc: string;
  imageAlt: string;
};

/** 照片只从 public 下的交付目录读取，仓库不包含真实用户照片。 */
export const ABOUT_PHOTO_PATH_PREFIX = "/images/about/";

/**
 * 按交付契约解析一张 About 照片：文件存在于交付目录时返回站内路径，
 * 否则回退，避免干净环境向不存在的资源发起请求。
 */
export function resolveAboutPhoto(
  { imageSrc, imageAlt }: AboutPhotoSource,
  publicDirectory: string = join(process.cwd(), "public"),
): AboutPhoto {
  const deliveryDirectory = join(publicDirectory, ABOUT_PHOTO_PATH_PREFIX);
  const candidate = join(publicDirectory, imageSrc);
  const delivered = candidate.startsWith(deliveryDirectory) && candidate !== deliveryDirectory;

  return { src: delivered && isFile(candidate) ? imageSrc : null, alt: imageAlt };
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
