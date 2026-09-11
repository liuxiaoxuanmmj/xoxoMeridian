"use client";

import { createRoot, extend, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { AmbientLight, DirectionalLight, Group, PMREMGenerator, WebGLRenderer } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import AgentEntryErrorBoundary from "@/components/agent-entry/AgentEntryErrorBoundary";
import AgentEntryModel from "@/components/agent-entry/AgentEntryModel";
import type { AgentEntrySceneProps } from "@/components/agent-entry/agent-entry.types";

extend({ Group, AmbientLight, DirectionalLight });

type LoadedSceneProps = AgentEntrySceneProps & { instance: Group };

function SceneContents({ config, onReady, onError, instance }: LoadedSceneProps) {
  const { gl, scene, camera, invalidate } = useThree();
  const submitted = useRef(false);
  const alive = useRef(false);

  useLayoutEffect(() => {
    alive.current = true;
    let cleanup: (() => void) | undefined;
    try {
      camera.lookAt(...config.camera.target);
      camera.updateMatrixWorld();
      const generator = new PMREMGenerator(gl);
      const room = new RoomEnvironment();
      try {
        const environment = generator.fromScene(room, 0.04);
        scene.environment = environment.texture;
        cleanup = () => { scene.environment = null; environment.dispose(); };
      } finally { generator.dispose(); room.dispose(); }
      invalidate();
    } catch { onError(); }
    return () => { alive.current = false; cleanup?.(); };
  }, [camera, config.camera.target, gl, invalidate, onError, scene]);

  // 正优先级接管 demand 帧，在真实 render 提交后才通知 DOM 层。
  useFrame(() => {
    try {
      gl.render(scene, camera);
      if (!submitted.current) {
        submitted.current = true;
        queueMicrotask(() => { if (alive.current) onReady(config.model); });
      }
    } catch { onError(); }
  }, 1);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 3, 4]} intensity={2} />
      <group scale={config.scale} position={[...config.position]} rotation={[...config.rotation]} dispose={null}>
        <primitive object={instance} dispose={null} />
      </group>
    </>
  );
}

function SceneCanvas({ config, onReady, onError, instance }: LoadedSceneProps) {
  const container = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    // 每次 effect 使用新 canvas，Strict Mode 的旧 root 延迟清理不会影响新实例。
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%;pointer-events:none";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);
    let active = true;
    let renderer: WebGLRenderer | undefined;
    let root: ReturnType<typeof createRoot> | undefined;
    let observer: ResizeObserver | undefined;
    const fail = () => { if (active) onError(); };
    const lost = (event: Event) => { event.preventDefault(); fail(); };
    canvas.addEventListener("webglcontextlost", lost);

    const initialize = async () => {
      try {
        renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
        renderer.setClearColor(0x000000, 0);
        root = createRoot(canvas);
        const rectangle = host.getBoundingClientRect();
        await root.configure({
          gl: renderer,
          frameloop: "demand",
          dpr: [1, 1.5],
          size: { width: rectangle.width, height: rectangle.height, top: 0, left: 0 },
          camera: { position: [...config.camera.position], fov: config.camera.fov, near: config.camera.near, far: config.camera.far },
        });
        if (!active) return;
        const store = root.render(
          <AgentEntryErrorBoundary onError={fail}>
            <SceneContents instance={instance} config={config} onReady={(model) => { if (active) onReady(model); }} onError={fail} />
          </AgentEntryErrorBoundary>,
        );
        observer = new ResizeObserver(() => {
          if (!active) return;
          const size = host.getBoundingClientRect();
          store.getState().setSize(size.width, size.height, 0, 0);
          store.getState().invalidate();
        });
        observer.observe(host);
      } catch { fail(); }
    };
    void initialize();
    return () => {
      active = false;
      observer?.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      root?.unmount();
      renderer?.dispose();
      canvas.remove();
    };
  }, [config, instance, onError, onReady]);

  return <span ref={container} data-agent-entry-scene="" aria-hidden="true" style={{ display: "block", width: "100%", height: "100%", pointerEvents: "none" }} />;
}

export default function AgentEntryScene(props: AgentEntrySceneProps) {
  return (
    <AgentEntryErrorBoundary onError={props.onError}>
      <Suspense fallback={null}>
        <AgentEntryModel config={props.config}>
          {(instance) => <SceneCanvas {...props} instance={instance} />}
        </AgentEntryModel>
      </Suspense>
    </AgentEntryErrorBoundary>
  );
}
