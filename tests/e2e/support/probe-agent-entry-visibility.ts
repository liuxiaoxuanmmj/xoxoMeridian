/**
 * 补充原生可见性证据：在默认主题 production E2E 服务及 auth setup 就绪后运行
 * ./scripts/run-node22.sh node --import tsx tests/e2e/support/probe-agent-entry-visibility.ts [结果路径]
 * Playwright 会在内部 CDP Session 开启 focus emulation，因此本探针直接连接独立 Chrome。
 * 沿用隔离测试 Cookie，只读页面/快照，不登录、不退出、不发送消息、不访问数据库。
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { z } from "zod";

type Frame = { at: number; center: number; pixels: number };
type Visibility = { state: DocumentVisibilityState; trusted: boolean; at: number; draws: number };
type Observation = { draws: number; frames: Frame[]; visibility: Visibility[]; state: DocumentVisibilityState };
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout; method: string };
type Send = <T = unknown>(method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<T>;
const pause = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));

async function waitFor<T>(read: () => Promise<T>, predicate: (value: T) => boolean, label: string, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  do {
    const value = await read();
    if (predicate(value)) return value;
    await pause(40);
  } while (Date.now() < deadline);
  throw new Error(`等待失败：${label}`);
}

const metadata = z.object({ appMode: z.literal("production"), buildTheme: z.literal("default"), baseURL: z.url() })
  .parse(JSON.parse(await readFile("test-results/.e2e-app.json", "utf8")));
const baseURL = new URL(metadata.baseURL);
assert(["127.0.0.1", "localhost"].includes(baseURL.hostname) && baseURL.port === "3100", "仅允许本地隔离 E2E 服务。");
assert.equal(new URL((await readFile("test-results/.e2e-database-url", "utf8")).trim()).pathname, "/xoxo_meridian_e2e", "必须由隔离 E2E harness 建立服务。");
const storage = z.object({ cookies: z.array(z.object({
  name: z.string(), value: z.string(), domain: z.string(), path: z.string(), expires: z.number(),
  httpOnly: z.boolean(), secure: z.boolean(), sameSite: z.enum(["Strict", "Lax", "None"]),
})) }).parse(JSON.parse(await readFile("test-results/.auth/user-one.json", "utf8")));
const cookies = storage.cookies.filter((cookie) => cookie.domain === baseURL.hostname);
assert(cookies.some((cookie) => cookie.name === "xoxo_session"), "缺少同源 E2E Cookie。");
const health = await fetch(new URL("/api/health", baseURL), { signal: AbortSignal.timeout(5000) });
assert(health.ok, "隔离 E2E 服务尚未就绪。");
const identity = await fetch(new URL("/api/auth/me", baseURL), {
  headers: { cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ") }, signal: AbortSignal.timeout(5000),
});
assert(identity.ok, "既有 E2E Session 已失效；请等待新的 auth setup，不要在探针中登录。");

const profile = await mkdtemp(join(tmpdir(), "xoxo-native-visibility-"));
const resultPath = process.argv[2] ?? "/tmp/feat080-native-visibility-result.json";
let child: ChildProcess | undefined;
let socket: WebSocket | undefined;
let send: Send | undefined;
let result: Record<string, unknown> = { passed: false, mechanism: "raw Chrome CDP native tab activation, without Playwright attachment" };
try {
  child = spawn(chromium.executablePath(), [
    "--headless=new", "--no-sandbox", "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const endpoint = await new Promise<string>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Chrome DevTools 启动超时")), 10_000);
    child!.stderr!.on("data", (chunk: Buffer) => {
      output = `${output}${chunk}`.slice(-8192);
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child!.once("error", (error) => { clearTimeout(timer); reject(error); });
    child!.once("exit", () => { clearTimeout(timer); reject(new Error("Chrome 提前退出。")); });
  });
  const connection = new WebSocket(endpoint);
  socket = connection;
  await new Promise<void>((resolve, reject) => { connection.addEventListener("open", () => resolve(), { once: true }); connection.addEventListener("error", () => reject(new Error("DevTools 连接失败。")), { once: true }); });
  let sequence = 0;
  const pending = new Map<number, Pending>();
  connection.addEventListener("message", (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as { id?: number; result?: unknown; error?: { message: string } };
    const request = message.id === undefined ? undefined : pending.get(message.id);
    if (!request) return;
    pending.delete(message.id!); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
    else request.resolve(message.result);
  });
  const cdp: Send = <T>(method: string, params: Record<string, unknown> = {}, sessionId?: string) => new Promise<T>((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} 超时`)); }, 5000);
    pending.set(id, { resolve: (value) => resolve(value as T), reject, timer, method });
    connection.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  send = cdp;
  const browser = await cdp<{ product: string }>("Browser.getVersion");
  const pageTarget = (await cdp<{ targetInfos: Array<{ targetId: string; type: string }> }>("Target.getTargets")).targetInfos.find((target) => target.type === "page");
  assert(pageTarget);
  const { sessionId } = await cdp<{ sessionId: string }>("Target.attachToTarget", { targetId: pageTarget.targetId, flatten: true });
  await cdp("Page.enable", {}, sessionId);
  await cdp("Runtime.enable", {}, sessionId);
  async function evaluate<T>(expression: string): Promise<T> {
    const response = await cdp<{ result: { value: T }; exceptionDetails?: { text: string } }>("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  }
  await cdp("Network.setCookies", { cookies }, sessionId);
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: observationScript() }, sessionId);
  await cdp("Page.navigate", { url: new URL("/about", baseURL).href }, sessionId);
  await waitFor(() => evaluate<boolean>("Boolean(document.querySelector('[data-agent-entry][data-ready=true] canvas'))"), Boolean, "默认模型真实首帧", 30_000);
  assert(await evaluate<boolean>("Boolean(window.nativeEntry)"), "原生新文档观测钩子未安装。");
  assert(await evaluate<boolean>("performance.getEntriesByType('resource').some(entry=>entry.name.endsWith('/default/scene.glb'))"), "本次必须验证默认主题。");
  const observations = () => evaluate<Observation>("({draws:window.nativeEntry.draws,frames:window.nativeEntry.frames,visibility:window.nativeEntry.visibility,state:document.visibilityState})");
  async function settled() {
    let previous = -1;
    let stable = 0;
    return waitFor(async () => {
      const observed = await observations();
      stable = observed.draws === previous && observed.draws > 0 ? stable + 1 : 0;
      previous = observed.draws;
      await pause(80);
      return { observed, stable };
    }, (value) => value.stable >= 4, "WebGL 停止绘制", 8000);
  }
  const baseline = (await settled()).observed.frames.at(-1)!;
  assert(baseline.pixels > 50);
  await evaluate("window.savedNativeCanvas=document.querySelector('[data-agent-entry] canvas');window.savedNativeContext=window.savedNativeCanvas.getContext('webgl2');true");
  const second = await cdp<{ targetId: string }>("Target.createTarget", { url: "about:blank", newWindow: false, background: true });
  const originalWindow = await cdp<{ windowId: number }>("Browser.getWindowForTarget", { targetId: pageTarget.targetId });
  const alternateWindow = await cdp<{ windowId: number }>("Browser.getWindowForTarget", { targetId: second.targetId });
  assert.equal(originalWindow.windowId, alternateWindow.windowId);
  await cdp("Target.activateTarget", { targetId: pageTarget.targetId });
  async function clickEntry() {
    const point = await evaluate<{ x: number; y: number }>("(()=>{const box=document.querySelector('[data-agent-entry] button').getBoundingClientRect();return{x:box.x+box.width/2,y:box.y+box.height/2};})()");
    await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...point }, sessionId);
    await cdp("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", buttons: 1, clickCount: 1, ...point }, sessionId);
    await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", buttons: 0, clickCount: 1, ...point }, sessionId);
  }
  await clickEntry();
  const inMotion = await waitFor(observations, (value) => Math.abs(value.frames.at(-1)!.center - baseline.center) > 2, "隐藏前真实点击位移");
  await cdp("Target.activateTarget", { targetId: second.targetId });
  const hidden = await waitFor(observations, (value) => value.state === "hidden" && value.visibility.at(-1)?.trusted === true, "原生 trusted hidden");
  await pause(1200); // 实际隐藏时长超过 950ms 点击动作，覆盖恢复时误补播旧动作。
  const hiddenEnd = await observations();
  assert.equal(hiddenEnd.state, "hidden");
  assert(hiddenEnd.draws - hidden.draws <= 1, "隐藏时不应继续渲染动作。");
  await cdp("Target.activateTarget", { targetId: pageTarget.targetId });
  const visible = await waitFor(observations, (value) => value.state === "visible" && value.visibility.at(-1)?.state === "visible" && value.visibility.at(-1)?.trusted === true, "原生 trusted visible");
  const restored = (await settled()).observed;
  const identity = await evaluate("({sameCanvas:window.savedNativeCanvas===document.querySelector('[data-agent-entry] canvas'),sameContext:window.savedNativeContext===document.querySelector('[data-agent-entry] canvas').getContext('webgl2'),contextLost:window.savedNativeContext.isContextLost(),dialog:Boolean(document.querySelector('[role=dialog]'))})");
  assert.deepEqual(identity, { sameCanvas: true, sameContext: true, contextLost: false, dialog: true });
  const restoredFrames = restored.frames.filter((frame) => frame.at >= visible.visibility.at(-1)!.at);
  assert(restoredFrames.length > 0, "恢复必须提交归位帧。");
  assert(restoredFrames.every((frame) => Math.abs(frame.center - baseline.center) < 1), "恢复不应补播旧动作。");
  const restartAt = await evaluate<number>("performance.now()");
  await clickEntry();
  await waitFor(observations, (value) => Math.abs(value.frames.at(-1)!.center - baseline.center) > 2, "恢复后再次点击位移");
  const finished = (await settled()).observed;
  const restartedFrames = finished.frames.filter((frame) => frame.at >= restartAt);
  assert(restartedFrames.length > 2);
  assert(Math.abs(restartedFrames.at(-1)!.center - baseline.center) < 1);
  result = {
    passed: true, browser: browser.product, theme: "default", webgl: "SwiftShader", mechanism: result.mechanism,
    sameWindow: true, identity, nativeEvents: finished.visibility,
    hiddenDurationMs: visible.visibility.at(-1)!.at - hidden.visibility.at(-1)!.at,
    hiddenDraws: hiddenEnd.draws - hidden.draws,
    preHideDisplacement: Math.abs(inMotion.frames.at(-1)!.center - baseline.center), restorationFrames: restoredFrames.length,
    restorationMaxDisplacement: Math.max(...restoredFrames.map((frame) => Math.abs(frame.center - baseline.center))),
    subsequentClickFrames: restartedFrames.length, subsequentClickPeak: Math.max(...restartedFrames.map((frame) => Math.abs(frame.center - baseline.center))),
    subsequentRestDisplacement: Math.abs(restartedFrames.at(-1)!.center - baseline.center),
  };
  console.log(JSON.stringify(result));
} catch (error) {
  result = { ...result, error: error instanceof Error ? error.message : "原生可见性探针失败。" };
  throw error;
} finally {
  try { await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`); }
  finally {
    if (send) await send("Browser.close").catch(() => undefined);
    socket?.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((done) => {
        const timer = setTimeout(() => child?.kill("SIGKILL"), 5000);
        child!.once("exit", () => { clearTimeout(timer); done(); });
        child!.kill("SIGTERM");
      });
    }
    await rm(profile, { recursive: true, force: true });
  }
}

// 与浏览器 E2E 相同：从实际 draw 后的像素透明轮廓取中心，不读取模型内部状态。
function observationScript() { return `
  window.nativeEntry={draws:0,frames:[],visibility:[]};
  document.addEventListener("visibilitychange",event=>window.nativeEntry.visibility.push({state:document.visibilityState,trusted:event.isTrusted,at:performance.now(),draws:window.nativeEntry.draws}));
  const queued=new WeakSet(),originalDraw=WebGL2RenderingContext.prototype.drawElements;
  WebGL2RenderingContext.prototype.drawElements=function(...args){
    const result=Reflect.apply(originalDraw,this,args);
    if(!(this.canvas instanceof HTMLCanvasElement)||!this.canvas.closest("[data-agent-entry]")||this.getParameter(this.FRAMEBUFFER_BINDING)!==null)return result;
    const observed=window.nativeEntry;observed.draws+=1;
    if(queued.has(this))return result;queued.add(this);
    queueMicrotask(()=>{
      queued.delete(this);if(this.isContextLost())return;
      const width=this.drawingBufferWidth,height=this.drawingBufferHeight,pixels=new Uint8Array(width*height*4);
      this.readPixels(0,0,width,height,this.RGBA,this.UNSIGNED_BYTE,pixels);
      let total=0,sum=0;
      for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2){if(pixels[(y*width+x)*4+3]>=32){total+=1;sum+=y;}}
      if(total)observed.frames.push({at:performance.now(),center:sum/total,pixels:total});
    });return result;
  };
`; }
