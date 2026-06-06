export type LoginVisualTheme = {
  accent: string;
  accentHover: string;
  gradientFrom: string;
  gradientTo: string;
  overlay: string;
};

export type LoginVisualItem = {
  id: string;
  imageUrl: string;
  theme: LoginVisualTheme;
};

export type LoginVisualsManifest = {
  version: 1;
  intervalMs: number;
  items: LoginVisualItem[];
};

export const FALLBACK_LOGIN_VISUALS: LoginVisualsManifest = {
  version: 1,
  intervalMs: 7000,
  items: [
    {
      id: "fallback-login-bg",
      imageUrl: "/images/login-bg.jpg",
      theme: {
        accent: "#3a5b22",
        accentHover: "#2e4a1a",
        gradientFrom: "#f5f1e9",
        gradientTo: "#dbe6cf",
        overlay: "rgba(255,255,255,0.12)",
      },
    },
  ],
};
