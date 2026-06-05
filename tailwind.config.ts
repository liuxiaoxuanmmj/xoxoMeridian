import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-poppins)", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#283034",
        warm: {
          50: "#fff8f3",
          100: "#ffe9db",
          200: "#ffd2bd",
          500: "#e16a46",
          700: "#9d3d27"
        },
        sage: {
          50: "#f3f7f0",
          100: "#dfead8",
          300: "#a7c49b",
          500: "#668a5b",
          600: "#527349",
          700: "#3f5d38"
        },
        skysoft: {
          50: "#eff7fb",
          100: "#d8edf7",
          500: "#3d87a4"
        }
      },
      boxShadow: {
        soft: "0 18px 45px rgba(54, 43, 35, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;
