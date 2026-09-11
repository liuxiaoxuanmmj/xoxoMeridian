import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { assetThemes, assertAssetPromotable, candidateRatios, inspectAsset, parseAssetArguments } from "./lib/agent-entry-assets";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const cli = join(root, "node_modules/@gltf-transform/cli/bin/cli.js");
const recipeFile = join(root, "3d-source/agent-entry/optimization-recipes.json");
const sourceHashes = {
  default: "f85011629f31c036768c3fd559f354fa063fe457f2e452a631173666c6c95961",
  "birthday-2026": "5dd17573f77c6713b013c8f974c108c2e138afb4b63b42c159744d9aac8ea384",
};

async function jsonWrite(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temp, path);
}

async function main() {
  const command = parseAssetArguments(process.argv.slice(2));
  if (command.action === "check") {
    for (const theme of command.theme ? [command.theme] : assetThemes) {
      const report = await inspectAsset(join(root, `public/models/agent-entry/${theme}/scene.glb`));
      assertAssetPromotable(report);
      console.log(JSON.stringify({ theme, ...report }));
    }
    return;
  }
  const theme = command.theme!;
  const source = `3d-source/agent-entry/${theme}/source.glb`;
  const sourceReport = await inspectAsset(join(root, source));
  if (sourceReport.sha256 !== sourceHashes[theme]) throw new Error("原始模型 SHA-256 与归档契约不符");
  if (command.action === "inspect") {
    console.log(JSON.stringify({ theme, source, ...sourceReport }, null, 2));
    return;
  }
  if (command.action === "promote") {
    const selections = z.object({ selections: z.record(z.string(), z.object({
      candidate: z.string(), sha256: z.string(), selectedBy: z.literal("user"), reason: z.string().min(1),
    })) }).parse(JSON.parse(await readFile(join(root, "3d-source/agent-entry/selection.json"), "utf8")));
    const selection = selections.selections[theme];
    if (!selection || selection.candidate !== command.candidate || selection.sha256 !== command.sha256) {
      throw new Error("尚无与候选路径/hash 匹配的用户选择记录");
    }
    const candidate = join(root, command.candidate!);
    const report = await inspectAsset(candidate);
    if (report.sha256 !== command.sha256) throw new Error("候选 SHA-256 已改变");
    assertAssetPromotable(report);
    const target = join(root, `public/models/agent-entry/${theme}/scene.glb`);
    await mkdir(dirname(target), { recursive: true });
    const backup = join(root, `3d-source/agent-entry/${theme}/previous-runtime.glb`);
    try { await copyFile(target, backup); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await copyFile(candidate, `${target}.tmp`);
    await rename(`${target}.tmp`, target);
    const recipes: Record<string, unknown> = JSON.parse(await readFile(recipeFile, "utf8"));
    recipes[theme] = { source, sourceSha256: sourceReport.sha256, selection, report,
      recipe: JSON.parse(await readFile(candidate.replace(/\.glb$/, ".json"), "utf8")) };
    await jsonWrite(recipeFile, recipes);
    console.log(`${theme} 已按用户选择提升，SHA-256=${report.sha256}`);
    return;
  }
  const outputDirectory = `public/.agent-entry-candidates/${theme}`;
  await mkdir(join(root, outputDirectory), { recursive: true });
  const { stdout: version } = await exec(process.execPath, [cli, "--version"], { cwd: root });
  for (const ratio of candidateRatios) {
    const temporary = await mkdtemp(join(tmpdir(), "agent-entry-optimize-"));
    const candidate = `${outputDirectory}/ratio-${ratio}.glb`;
    const steps = [
      ["weld", source, join(temporary, "weld.glb")],
      ["simplify", join(temporary, "weld.glb"), join(temporary, "simplify.glb"), "--ratio", String(Number(ratio) / 100), "--error", "1"],
      ["resize", join(temporary, "simplify.glb"), join(temporary, "resize.glb"), "--width", "2048", "--height", "2048", "--filter", "lanczos3"],
      ["tangents", join(temporary, "resize.glb"), join(temporary, "tangents.glb")],
      ["meshopt", join(temporary, "tangents.glb"), candidate, "--level", "high", "--quantization-volume", "mesh", "--quantize-position", "14", "--quantize-normal", "10", "--quantize-texcoord", "12", "--quantize-color", "8", "--quantize-weight", "8", "--quantize-generic", "12"],
    ];
    try {
      for (const args of steps) {
        console.log(`[${theme}/${ratio}%] ${args[0]}`);
        await exec(process.execPath, [cli, ...args], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
      }
      const report = await inspectAsset(join(root, candidate));
      const recipe = { theme, source, sourceSha256: sourceReport.sha256, cliVersion: version.trim(),
        ratio: Number(ratio) / 100, texturePolicy: "保留 JPEG/PNG 与贴图语义；Lanczos3 最长边 2048；只由 meshopt 执行一次量化。",
        steps: steps.map((args) => args.map((arg) => arg.replace(temporary, "<temporary>"))), candidate, ...report };
      await jsonWrite(join(root, candidate.replace(/\.glb$/, ".json")), recipe);
      console.log(JSON.stringify({ theme, ratio, bytes: report.bytes, triangles: report.triangles, hash: report.sha256, budget: report.budget, validator: report.validator }));
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }
  try { await writeFile(recipeFile, "{}\n", { flag: "wx" }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
