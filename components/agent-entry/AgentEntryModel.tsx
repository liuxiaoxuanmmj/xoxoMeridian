"use client";

import { useGLTF } from "@react-three/drei/core/Gltf";
import { useMemo, type ReactNode } from "react";
import type { Group } from "three";
import type { AgentEntryProps } from "@/components/agent-entry/agent-entry.types";

export default function AgentEntryModel({ config, children }: AgentEntryProps & { children: (instance: Group) => ReactNode }) {
  const { scene } = useGLTF(config.model, false, true);
  // 每个 root 拥有独立 Object3D 树；几何、材质和纹理由 useGLTF 缓存持有。
  const instance = useMemo(() => scene.clone(true), [scene]);
  // useGLTF 不依赖 Canvas context。让加载错误在 DOM boundary 处理，
  // 避免 R3F 9.7 将已捕获的错误仍通过 window.reportError 再次上报。
  return children(instance);
}
