import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
import { z } from "zod";

export const assetThemes = ["default", "birthday-2026"] as const;
export const candidateRatios = ["15", "10", "7.5", "5"] as const;
export type AssetTheme = (typeof assetThemes)[number];
const allowedExtensions = new Set(["EXT_meshopt_compression", "KHR_mesh_quantization"]);
export const runtimeBudget = { bytes: 8_388_608, triangles: 150_000, textureDimension: 2048 } as const;
const integer = z.number().int().nonnegative();
const gltfSchema = z.object({
  asset: z.object({ version: z.literal("2.0") }).passthrough(),
  scene: integer.optional(),
  scenes: z.array(z.object({ nodes: z.array(integer).default([]) }).passthrough()).min(1),
  nodes: z.array(z.object({ mesh: integer.optional(), children: z.array(integer).default([]) }).passthrough()).default([]),
  meshes: z.array(z.object({ primitives: z.array(z.object({
    indices: integer.optional(),
    attributes: z.record(z.string(), integer),
    mode: integer.default(4),
  }).passthrough()).min(1) }).passthrough()).default([]),
  accessors: z.array(z.object({ count: integer }).passthrough()).default([]),
  buffers: z.array(z.object({ byteLength: integer, uri: z.string().optional() }).passthrough()).default([]),
  bufferViews: z.array(z.object({ buffer: integer, byteOffset: integer.default(0), byteLength: integer }).passthrough()).default([]),
  images: z.array(z.object({ bufferView: integer.optional(), mimeType: z.string().optional(), uri: z.string().optional() }).passthrough()).default([]),
  extensionsUsed: z.array(z.string()).default([]),
  extensionsRequired: z.array(z.string()).default([]),
}).passthrough();
export type AssetDocument = z.infer<typeof gltfSchema>;

function verifyExtensions(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(verifyExtensions);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "extensions" && child && typeof child === "object") {
      for (const extension of Object.keys(child)) {
        if (!allowedExtensions.has(extension)) throw new Error(`不支持的扩展：${extension}`);
      }
    }
    verifyExtensions(child);
  }
}

/** 在 NodeIO/validator 接触输入之前拒绝外部引用，检查 GLB 容器的完整边界。 */
export function parseGlb(input: Uint8Array): { json: AssetDocument; binary: Buffer } {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.length < 20) throw new Error("GLB 头部截断");
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error("需要完整 GLB v2 文件");
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error("GLB 声明长度与实际长度不一致或已截断");
  let jsonBytes: Buffer | undefined;
  let binary = Buffer.alloc(0);
  let offset = 12;
  let chunks = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error("GLB chunk 头部截断");
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (length % 4 || offset + 8 + length > bytes.length) throw new Error("GLB chunk 长度错误或截断");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (chunks === 0 && type === 0x4e4f534a) jsonBytes = data;
    else if (chunks === 1 && type === 0x004e4942) binary = Buffer.from(data);
    else throw new Error("GLB chunk 顺序或类型不受支持");
    offset += 8 + length;
    chunks += 1;
  }
  if (!jsonBytes) throw new Error("GLB 缺少 JSON chunk");
  const raw: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(jsonBytes));
  const json = gltfSchema.parse(raw);
  for (const resource of [...json.buffers, ...json.images]) {
    if (resource.uri !== undefined) throw new Error("不允许 buffer/image URI，资源必须直接内嵌 GLB");
  }
  for (const extension of [...json.extensionsUsed, ...json.extensionsRequired]) {
    if (!allowedExtensions.has(extension)) throw new Error(`不支持的扩展：${extension}`);
  }
  verifyExtensions(raw);
  return { json, binary };
}

/** 计算实际默认场景实例，不能只对唯一 mesh 去重计数。 */
export function getSceneTriangleCount(json: AssetDocument): number {
  const scene = json.scenes[json.scene ?? 0];
  if (!scene) throw new Error("默认 scene 不存在");
  const visit = (index: number, ancestors: Set<number>): number => {
    if (ancestors.has(index)) throw new Error("场景节点存在循环");
    const node = json.nodes[index];
    if (!node) throw new Error(`节点不存在：${index}`);
    const nextAncestors = new Set(ancestors).add(index);
    let triangles = 0;
    if (node.mesh !== undefined) {
      const mesh = json.meshes[node.mesh];
      if (!mesh) throw new Error(`Mesh 不存在：${node.mesh}`);
      for (const primitive of mesh.primitives) {
        const accessor = json.accessors[primitive.indices ?? primitive.attributes.POSITION];
        if (!accessor) throw new Error("Primitive 缺少有效的计数 accessor");
        if (primitive.mode === 4) {
          if (accessor.count % 3) throw new Error("TRIANGLES accessor count 必须由 3 整除");
          triangles += accessor.count / 3;
        } else if (primitive.mode === 5 || primitive.mode === 6) {
          triangles += Math.max(0, accessor.count - 2);
        } else throw new Error(`不支持的绘制拓扑：${primitive.mode}`);
      }
    }
    for (const child of node.children) triangles += visit(child, nextAncestors);
    if (!Number.isSafeInteger(triangles)) throw new Error("场景三角面计数超出安全整数范围");
    return triangles;
  };
  return scene.nodes.reduce((sum, index) => sum + visit(index, new Set()), 0);
}

interface BudgetMetrics {
  bytes: number;
  triangles: number;
  textures: readonly { width: number; height: number }[];
}

export function assertRuntimeBudget(metrics: BudgetMetrics): void {
  const failures: string[] = [];
  if (!Number.isSafeInteger(metrics.bytes) || metrics.bytes < 0 || metrics.bytes > runtimeBudget.bytes) failures.push(`字节 ${metrics.bytes} > ${runtimeBudget.bytes}`);
  if (!Number.isSafeInteger(metrics.triangles) || metrics.triangles < 0 || metrics.triangles > runtimeBudget.triangles) failures.push(`三角面 ${metrics.triangles} > ${runtimeBudget.triangles}`);
  for (const [index, texture] of metrics.textures.entries()) {
    if (![texture.width, texture.height].every((dimension) => Number.isInteger(dimension) && dimension > 0 && dimension <= runtimeBudget.textureDimension)) failures.push(`纹理 ${index} 尺寸 ${texture.width}×${texture.height} 超过 ${runtimeBudget.textureDimension}`);
  }
  if (failures.length) throw new Error(`运行时预算不合格：${failures.join("；")}`);
}

interface ValidatorMessage {
  code: string;
  message: string;
  severity: number;
  pointer?: string;
}
interface ValidatorResult {
  issues: { numErrors: number; numWarnings: number; messages: ValidatorMessage[]; truncated: boolean };
}
const require = createRequire(import.meta.url);
const validator = require("gltf-validator") as {
  validateBytes(bytes: Uint8Array, options: { maxIssues: number }): Promise<ValidatorResult>;
  version(): string;
};

export interface AssetReport extends BudgetMetrics {
  sha256: string;
  textures: { index: number; width: number; height: number; format: string; mimeType: string }[];
  extensions: string[];
  validator: {
    version: string;
    errors: number;
    warnings: number;
    messages: (ValidatorMessage & { stage: "encoded" | "decoded"; acceptedReason?: string })[];
  };
  budget: { passed: boolean; reason: string };
}

export async function inspectAsset(path: string): Promise<AssetReport> {
  const bytes = await readFile(path);
  const { json, binary } = parseGlb(bytes);
  const triangles = getSceneTriangleCount(json);
  const textures = await Promise.all(json.images.map(async (image, index) => {
    if (image.bufferView === undefined) throw new Error(`纹理 ${index} 未内嵌`);
    const view = json.bufferViews[image.bufferView];
    if (!view || view.buffer !== 0 || view.byteOffset + view.byteLength > binary.length) throw new Error(`纹理 ${index} 的 bufferView 无效`);
    const metadata = await sharp(binary.subarray(view.byteOffset, view.byteOffset + view.byteLength)).metadata();
    if (!metadata.width || !metadata.height || !["jpeg", "png"].includes(metadata.format ?? "")) throw new Error(`纹理 ${index} 必须为有效 JPEG/PNG`);
    const mimeType = metadata.format === "jpeg" ? "image/jpeg" : "image/png";
    if (image.mimeType !== mimeType) throw new Error(`纹理 ${index} MIME 与内容不一致`);
    return { index, width: metadata.width, height: metadata.height, format: metadata.format!, mimeType };
  }));
  const encoded = await validator.validateBytes(bytes, { maxIssues: 10_000 });
  if (encoded.issues.truncated) throw new Error("validator 报告被截断，不能视为检查通过");
  const messages: AssetReport["validator"]["messages"] = encoded.issues.messages.map((message) => ({ ...message, stage: "encoded" }));
  let errors = encoded.issues.numErrors;
  let warnings = encoded.issues.numWarnings;
  if (json.extensionsUsed.includes("EXT_meshopt_compression") && errors === 0) {
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    const document = await io.readBinary(bytes);
    document.getRoot().listExtensionsUsed().find((extension) => extension.extensionName === "EXT_meshopt_compression")?.dispose();
    const decodedBytes = await io.writeBinary(document);
    if (getSceneTriangleCount(parseGlb(decodedBytes).json) !== triangles) throw new Error("Meshopt 解码前后三角面计数不一致");
    const decoded = await validator.validateBytes(decodedBytes, { maxIssues: 10_000 });
    if (decoded.issues.truncated) throw new Error("解码后 validator 报告被截断");
    errors += decoded.issues.numErrors;
    warnings += decoded.issues.numWarnings;
    messages.push(...decoded.issues.messages.map((message) => ({ ...message, stage: "decoded" as const })));
    for (const message of messages) {
      if (message.stage === "encoded" && message.code === "UNSUPPORTED_EXTENSION" && message.message.includes("EXT_meshopt_compression")) {
        message.acceptedReason = "锁定 validator 不识别 Meshopt；已用 meshoptimizer 1.2.0 真解码并再次校验，解码前后实际场景面数一致；运行时另由锁定 Drei/three-stdlib 的真实浏览器验证。";
      }
    }
  }
  let budget = { passed: true, reason: "三个硬预算均通过。" };
  try { assertRuntimeBudget({ bytes: bytes.length, triangles, textures }); }
  catch (error) { budget = { passed: false, reason: error instanceof Error ? error.message : String(error) }; }
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    triangles,
    textures,
    extensions: [...new Set([...json.extensionsUsed, ...json.extensionsRequired])].sort(),
    validator: { version: validator.version(), errors, warnings, messages },
    budget,
  };
}

export function assertAssetPromotable(report: AssetReport): void {
  assertRuntimeBudget(report);
  if (report.validator.errors) throw new Error(`validator 存在 ${report.validator.errors} 项 error`);
  const unexplained = report.validator.messages.filter((message) => message.severity === 1 && !message.acceptedReason);
  if (unexplained.length) throw new Error(`validator warnings 尚未处理：${unexplained.map((message) => message.code).join(", ")}`);
}

const argumentSchema = z.object({
  action: z.enum(["inspect", "candidates", "check", "promote"]),
  theme: z.enum(assetThemes).optional(),
  candidate: z.string().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export function parseAssetArguments(args: string[]) {
  const parsed = parseArgs({ args, allowPositionals: true, strict: true, options: {
    theme: { type: "string" }, candidate: { type: "string" }, sha256: { type: "string" },
  } });
  if (parsed.positionals.length !== 1) throw new Error("必须指定一个动作：inspect/candidates/check/promote");
  const command = argumentSchema.parse({ action: parsed.positionals[0], ...parsed.values });
  if (command.action !== "check" && !command.theme) throw new Error("该动作必须指定 --theme");
  if (command.action === "promote") {
    if (!command.sha256 || !command.candidate || !candidateRatios.some((ratio) => command.candidate === `public/.agent-entry-candidates/${command.theme}/ratio-${ratio}.glb`)) {
      throw new Error("promote 必须指定白名单内精确 --candidate 路径与 --sha256");
    }
  } else if (command.candidate || command.sha256) throw new Error("仅 promote 接受 --candidate/--sha256");
  return command;
}
