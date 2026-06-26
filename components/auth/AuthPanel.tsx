"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";

import { BrandBadge } from "@/components/layout/BrandBadge";
import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import {
  FALLBACK_LOGIN_VISUALS,
  type LoginVisualItem,
  type LoginVisualsManifest,
} from "@/lib/login-visuals-shared";

type Mode = "login" | "register";

type AuthPanelProps = {
  visuals: LoginVisualsManifest;
};

type AuthPanelStyle = CSSProperties & {
  "--auth-accent": string;
  "--auth-accent-hover": string;
  "--auth-gradient-from": string;
  "--auth-gradient-to": string;
  "--auth-overlay": string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeVisualItem(value: unknown): value is LoginVisualItem {
  if (!isRecord(value) || !isRecord(value.theme)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.imageUrl) &&
    isNonEmptyString(value.theme.accent) &&
    isNonEmptyString(value.theme.accentHover) &&
    isNonEmptyString(value.theme.gradientFrom) &&
    isNonEmptyString(value.theme.gradientTo) &&
    isNonEmptyString(value.theme.overlay)
  );
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return prefersReducedMotion;
}

function getSafeVisualItems(visuals: LoginVisualsManifest): LoginVisualItem[] {
  const candidateItems = (visuals as Partial<LoginVisualsManifest> | undefined)?.items;
  if (!Array.isArray(candidateItems)) {
    return FALLBACK_LOGIN_VISUALS.items;
  }

  const safeItems = candidateItems.filter(isSafeVisualItem);
  return safeItems.length > 0 ? safeItems : FALLBACK_LOGIN_VISUALS.items;
}

function getSafeIntervalMs(visuals: LoginVisualsManifest) {
  const candidateInterval = (visuals as Partial<LoginVisualsManifest> | undefined)?.intervalMs;
  return typeof candidateInterval === "number" &&
    Number.isFinite(candidateInterval) &&
    candidateInterval >= 4000
    ? candidateInterval
    : FALLBACK_LOGIN_VISUALS.intervalMs;
}

export function AuthPanel({ visuals }: AuthPanelProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [activeIndex, setActiveIndex] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();

  const visualItems = useMemo(() => getSafeVisualItems(visuals), [visuals]);
  const intervalMs = getSafeIntervalMs(visuals);
  const boundedActiveIndex = activeIndex < visualItems.length ? activeIndex : 0;
  const activeVisual =
    visualItems[boundedActiveIndex] ?? visualItems[0] ?? FALLBACK_LOGIN_VISUALS.items[0];
  const rootStyle: AuthPanelStyle = {
    "--auth-accent": activeVisual.theme.accent,
    "--auth-accent-hover": activeVisual.theme.accentHover,
    "--auth-gradient-from": activeVisual.theme.gradientFrom,
    "--auth-gradient-to": activeVisual.theme.gradientTo,
    "--auth-overlay": activeVisual.theme.overlay,
    background:
      "linear-gradient(135deg, color-mix(in srgb, var(--auth-gradient-from) 16%, #fdfbf7), #fdfbf7 44%, color-mix(in srgb, var(--auth-gradient-to) 14%, #fdfbf7))",
  };

  useEffect(() => {
    if (activeIndex >= visualItems.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, visualItems.length]);

  useEffect(() => {
    if (prefersReducedMotion || visualItems.length <= 1) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % visualItems.length);
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [intervalMs, prefersReducedMotion, visualItems.length]);

  useEffect(() => {
    if (typeof window === "undefined" || visualItems.length === 0) {
      return;
    }

    const nextVisual = visualItems[(boundedActiveIndex + 1) % visualItems.length];
    if (!nextVisual?.imageUrl) {
      return;
    }

    const image = new Image();
    image.src = nextVisual.imageUrl;
  }, [boundedActiveIndex, visualItems]);

  return (
    <div className="auth-visual-theme relative flex min-h-screen w-full" style={rootStyle}>
      <div className="absolute top-6 left-6 z-10 flex flex-col gap-3">
        <BrandBadge href="/home" accentClass="bg-[var(--auth-accent)]" />
        <Link
          href="/about"
          className="text-[11px] font-medium text-black/35 hover:text-black/60 transition-colors duration-200 ml-1"
        >
          About-me
        </Link>
      </div>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center px-6 lg:px-10">
        <div className="w-full max-w-[460px] relative rounded-[24px] bg-white/75 backdrop-blur-2xl border border-black/5 shadow-xl shadow-black/5">
          {/* Corner glow — cross-fade layers */}
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-[24px] overflow-hidden pointer-events-none"
          >
            {visualItems.map((visual, index) => (
              <div
                key={`glow-${visual.id}-${index}`}
                className={`absolute inset-0 transition-opacity duration-700 ease-out ${index === boundedActiveIndex ? "opacity-100" : "opacity-0"
                  } ${prefersReducedMotion ? "transition-none" : ""}`}
                style={{
                  background: `radial-gradient(circle at 20% 15%, color-mix(in srgb, ${visual.theme.accent} 18%, transparent) 0%, transparent 55%)`,
                }}
              />
            ))}
          </div>

          <div className="relative p-6 lg:p-8">
            {/* Tab switcher */}
            <div className="mb-8 flex gap-2">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 rounded-[10px] py-3 text-sm font-medium transition-colors duration-200 cursor-pointer ${mode === "login"
                  ? "bg-[var(--auth-accent)] text-white hover:bg-[var(--auth-accent-hover)]"
                  : "border border-[#d9d9d9] text-black/70 hover:bg-neutral-50 focus:ring-2 focus:ring-[var(--auth-accent)]"
                  }`}
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`flex-1 rounded-[10px] py-3 text-sm font-medium transition-colors duration-200 cursor-pointer ${mode === "register"
                  ? "bg-[var(--auth-accent)] text-white hover:bg-[var(--auth-accent-hover)]"
                  : "border border-[#d9d9d9] text-black/70 hover:bg-neutral-50 focus:ring-2 focus:ring-[var(--auth-accent)]"
                  }`}
              >
                注册
              </button>
            </div>

            {/* Title */}
            <h1 className="text-[28px] font-semibold leading-tight text-black">
              {mode === "login" ? "欢迎回来！" : "创建账号"}
            </h1>
            <p className="mt-1 text-[15px] leading-relaxed text-black/60">
              {mode === "login"
                ? "输入账号信息以继续使用"
                : "填写以下信息创建你的账号"}
            </p>

            <div className="mt-6">
              {mode === "login" ? (
                <LoginForm onSwitchToRegister={() => setMode("register")} />
              ) : (
                <RegisterForm onSwitchToLogin={() => setMode("login")} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Background image */}
      <div className="hidden lg:block lg:w-[42%] relative">
        <div className="absolute inset-0 overflow-hidden rounded-bl-[45px] rounded-tl-[45px] bg-[var(--auth-gradient-from)]">
          {visualItems.map((visual, index) => (
            <div
              key={`${visual.id}-${index}`}
              aria-hidden="true"
              data-testid={`auth-visual-layer-${visual.id}`}
              data-active={index === boundedActiveIndex ? "true" : "false"}
              className={`absolute inset-0 h-full w-full transition-opacity duration-700 ease-out ${index === boundedActiveIndex ? "opacity-100" : "opacity-0"
                } ${prefersReducedMotion ? "transition-none" : ""}`}
              style={{
                backgroundImage: `url(${JSON.stringify(visual.imageUrl)})`,
                backgroundPosition: "center",
                backgroundSize: "cover",
              }}
            />
          ))}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(145deg, color-mix(in srgb, var(--auth-gradient-from) 0%, transparent), color-mix(in srgb, var(--auth-gradient-to) 0%, transparent)), var(--auth-overlay)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
