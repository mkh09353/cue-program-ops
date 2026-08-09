import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/web/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Monochrome Paper — DESIGN.md
        canvas: "#f5f5f5",
        paper: "#ffffff",
        soft: "#fafafa",
        ink: {
          DEFAULT: "#0a0a0a",
          soft: "#171717",
        },
        mid: "#737373",
        line: "#e5e5e5",
        danger: "#e7000b",
        // Back-compat aliases (mapped onto monochrome so stray classes stay on-system)
        iris: "#0a0a0a",
        lime: "#fafafa",
        ok: "#0a0a0a",
        warn: "#171717",
        info: "#737373",
        ai: "#171717",
      },
      fontFamily: {
        sans: [
          "Geist",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        pill: "18px",
        card: "24px",
      },
      boxShadow: {
        card:
          "0 0 0 1px rgba(23,23,23,0.05), 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)",
        sm: "0 1px 2px rgba(10,10,10,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
