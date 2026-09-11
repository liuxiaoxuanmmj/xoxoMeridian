import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertAssetPromotable,
  assertRuntimeBudget,
  getSceneTriangleCount,
  inspectAsset,
  parseAssetArguments,
  parseGlb,
} from "@/scripts/lib/agent-entry-assets";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function glb(json: object, binary = Buffer.alloc(0)): Buffer {
  const serialized = Buffer.from(JSON.stringify(json));
  const paddedJson = Buffer.alloc(Math.ceil(serialized.byteLength / 4) * 4, 32);
  serialized.copy(paddedJson);
  const paddedBinary = Buffer.alloc(Math.ceil(binary.byteLength / 4) * 4);
  binary.copy(paddedBinary);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + paddedJson.length + (binary.length ? 8 + paddedBinary.length : 0), 8);
  header.writeUInt32LE(paddedJson.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  if (!binary.length) return Buffer.concat([header, paddedJson]);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(paddedBinary.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, paddedJson, binaryHeader, paddedBinary]);
}

function scene(mode = 4, count = 6) {
  return {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode }] }],
    accessors: [{ count, componentType: 5126, type: "VEC3" }],
  };
}

describe("Agent Entry GLB 结构与运行时预算", () => {
  it.each(["default", "birthday-2026"])("正式 %s 模型通过真实 GLB 校验与全部预算", async (theme) => {
    const report = await inspectAsset(`public/models/agent-entry/${theme}/scene.glb`);
    expect(report.validator.errors).toBe(0);
    expect(report.validator.warnings).toBe(0);
    expect(() => assertAssetPromotable(report)).not.toThrow();
  });

  it("拒绝截断、错误版本和额外尾部字节", () => {
    const valid = glb(scene());
    expect(() => parseGlb(valid.subarray(0, valid.length - 1))).toThrow(/长度|截断/);
    expect(() => parseGlb(Buffer.concat([valid, Buffer.alloc(4)]))).toThrow(/长度/);
    const wrongVersion = Buffer.from(valid);
    wrongVersion.writeUInt32LE(1, 4);
    expect(() => parseGlb(wrongVersion)).toThrow(/GLB v2/);
  });

  it.each(["https://example.test/a.bin", "../a.bin", "data:application/octet-stream;base64,AA=="])(
    "拒绝 buffer URI %s，确保资源直接内嵌于 GLB",
    (uri) => expect(() => parseGlb(glb({ ...scene(), buffers: [{ uri, byteLength: 1 }] }))).toThrow(/URI/),
  );

  it("拒绝 image 外部引用及未列入白名单的嵌套扩展", () => {
    expect(() => parseGlb(glb({ ...scene(), images: [{ uri: "texture.png" }] }))).toThrow(/URI/);
    expect(() => parseGlb(glb({ ...scene(), extensionsUsed: ["KHR_texture_basisu"] }))).toThrow(/扩展/);
    expect(() => parseGlb(glb({ ...scene(), nodes: [{ mesh: 0, extensions: { EXT_mesh_gpu_instancing: {} } }] }))).toThrow(/扩展/);
  });

  it("累计默认场景全部节点和重复 mesh 实例，排除未显示的其他场景", () => {
    const document = parseGlb(glb({
      ...scene(),
      scenes: [{ nodes: [0, 2] }, { nodes: [3] }],
      nodes: [{ children: [1] }, { mesh: 0 }, { mesh: 0 }, { mesh: 0 }],
    })).json;
    expect(getSceneTriangleCount(document)).toBe(4);
  });

  it.each([[4, 6, 2], [5, 6, 4], [6, 6, 4]])("正确计算 topology %i 的实际三角面", (mode, count, triangles) => {
    expect(getSceneTriangleCount(parseGlb(glb(scene(mode, count))).json)).toBe(triangles);
  });

  it("有索引时使用 accessor count，不使用顶点数或压缩字节数", () => {
    const document = scene();
    const indexed = {
      ...document,
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      accessors: [...document.accessors, { count: 30, componentType: 5123, type: "SCALAR" }],
    };
    expect(getSceneTriangleCount(parseGlb(glb(indexed)).json)).toBe(10);
  });

  it("拒绝未知/非三角拓扑、非法计数和循环节点", () => {
    expect(() => getSceneTriangleCount(parseGlb(glb(scene(1))).json)).toThrow(/拓扑/);
    expect(() => getSceneTriangleCount(parseGlb(glb(scene(4, 5))).json)).toThrow(/3 整除/);
    expect(() => getSceneTriangleCount(parseGlb(glb({ ...scene(), nodes: [{ children: [0] }] })).json)).toThrow(/循环/);
  });

  it("三个硬预算边界包含上限，任一超限均拒绝", () => {
    const maximum = { bytes: 8_388_608, triangles: 150_000, textures: [{ width: 2048, height: 2048 }] };
    expect(() => assertRuntimeBudget(maximum)).not.toThrow();
    expect(() => assertRuntimeBudget({ ...maximum, bytes: maximum.bytes + 1 })).toThrow(/字节/);
    expect(() => assertRuntimeBudget({ ...maximum, triangles: maximum.triangles + 1 })).toThrow(/三角面/);
    expect(() => assertRuntimeBudget({ ...maximum, textures: [{ width: 2049, height: 1 }] })).toThrow(/纹理/);
  });

  it("用真实 validator 拒绝结构可读但 POSITION 缺少 min/max 的 GLB", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-entry-assets-"));
    temporaryDirectories.push(directory);
    const binary = Buffer.alloc(36);
    binary.writeFloatLE(1, 12);
    binary.writeFloatLE(1, 28);
    const json = {
      ...scene(4, 3),
      buffers: [{ byteLength: 36 }],
      bufferViews: [{ buffer: 0, byteLength: 36, target: 34962 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    };
    const path = join(directory, "invalid.glb");
    await writeFile(path, glb(json, binary));
    const report = await inspectAsset(path);
    expect(report.validator.errors).toBeGreaterThan(0);
    expect(() => assertAssetPromotable(report)).toThrow(/validator/);
    expect(await readFile(path)).toEqual(glb(json, binary));
  });
});

describe("Agent Entry 显式资产命令", () => {
  it("仅接受固定主题与已知动作", () => {
    expect(parseAssetArguments(["inspect", "--theme", "birthday-2026"])).toMatchObject({ action: "inspect", theme: "birthday-2026" });
    expect(() => parseAssetArguments(["inspect", "--theme", "../default"])).toThrow();
    expect(() => parseAssetArguments(["download", "--theme", "default"])).toThrow();
    expect(() => parseAssetArguments(["inspect", "--theme", "default", "--allow-net"])).toThrow();
  });

  it("promote 必须提供精确候选白名单路径和 SHA-256", () => {
    expect(() => parseAssetArguments(["promote", "--theme", "default"])).toThrow();
    const args = ["promote", "--theme", "default", "--sha256", "a".repeat(64), "--candidate"];
    expect(() => parseAssetArguments([...args, "public/.agent-entry-candidates/default/../birthday-2026/ratio-5.glb"])).toThrow();
    expect(parseAssetArguments([...args, "public/.agent-entry-candidates/default/ratio-5.glb"])).toMatchObject({ action: "promote" });
  });
});
