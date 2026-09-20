import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveAboutPhoto } from "@/lib/about-photos";

const temporaryDirectories: string[] = [];

async function publicDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "xoxo-about-photos-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function deliver(publicRoot: string, publicPath: string) {
  const file = join(publicRoot, publicPath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("About 照片交付契约", () => {
  it("交付目录内存在照片时返回该站内路径", async () => {
    const publicRoot = await publicDirectory();
    await deliver(publicRoot, "/images/about/oo.jpg");

    expect(resolveAboutPhoto({ imageSrc: "/images/about/oo.jpg", imageAlt: "Portrait of oo" }, publicRoot)).toEqual({
      src: "/images/about/oo.jpg",
      alt: "Portrait of oo",
    });
  });

  it("干净环境下照片缺失时回退并保留可访问描述", async () => {
    const publicRoot = await publicDirectory();

    expect(resolveAboutPhoto({ imageSrc: "/images/about/xx.jpg", imageAlt: "Portrait of xx" }, publicRoot)).toEqual({
      src: null,
      alt: "Portrait of xx",
    });
  });

  it("交付路径上是目录而非文件时同样回退", async () => {
    const publicRoot = await publicDirectory();
    await mkdir(join(publicRoot, "/images/about/oo.jpg"), { recursive: true });

    expect(resolveAboutPhoto({ imageSrc: "/images/about/oo.jpg", imageAlt: "Portrait of oo" }, publicRoot).src).toBeNull();
  });

  it("交付目录之外的既有文件不会被当作照片", async () => {
    const publicRoot = await publicDirectory();
    await deliver(publicRoot, "/images/login-bg.jpg");
    await deliver(publicRoot, "/brand/logo_transparent.svg");

    expect(resolveAboutPhoto({ imageSrc: "/images/login-bg.jpg", imageAlt: "Login" }, publicRoot).src).toBeNull();
    expect(resolveAboutPhoto({ imageSrc: "/brand/logo_transparent.svg", imageAlt: "Brand" }, publicRoot).src).toBeNull();
  });

  it("越过交付目录的相对路径不会被读取", async () => {
    const publicRoot = await publicDirectory();
    await deliver(publicRoot, "/images/login-bg.jpg");

    expect(
      resolveAboutPhoto({ imageSrc: "/images/about/../login-bg.jpg", imageAlt: "Login" }, publicRoot).src,
    ).toBeNull();
  });

  it("只交付其中一张时另一张独立回退", async () => {
    const publicRoot = await publicDirectory();
    await deliver(publicRoot, "/images/about/oo.jpg");

    expect(resolveAboutPhoto({ imageSrc: "/images/about/oo.jpg", imageAlt: "Portrait of oo" }, publicRoot).src).toBe(
      "/images/about/oo.jpg",
    );
    expect(resolveAboutPhoto({ imageSrc: "/images/about/xx.jpg", imageAlt: "Portrait of xx" }, publicRoot)).toEqual({
      src: null,
      alt: "Portrait of xx",
    });
  });
});
