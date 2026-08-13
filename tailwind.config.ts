import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/web/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Ruckus Brand Paper — docs/DESIGN.md.
        // Neutral surfaces stay monochrome (canvas → soft → paper); VIOLET is the
        // primary action colour and semantic status tones are back. The old
        // "Monochrome Paper" rule (no chromatic colour beyond danger) is retired.
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
        // Semantic brand alias — prefer `brand-*` in app code so the accent can be
        // retuned in one place. Mirrors `ruckus-*` exactly.
        brand: {
          50: "#F5F3FF",
          100: "#EDE9FE",
          200: "#DDD6FE",
          400: "#A78BFA",
          500: "#8B5CF6",
          600: "#7C3AED",
          700: "#6D28D9",
        },
        // Ruckus brand (marketing surfaces + app accent)
        navy: {
          DEFAULT: "#1E1B2E",
          soft: "#2A2540",
        },
        ruckus: {
          50: "#F5F3FF",
          100: "#EDE9FE",
          200: "#DDD6FE",
          400: "#A78BFA",
          500: "#8B5CF6",
          600: "#7C3AED",
          700: "#6D28D9",
        },
      },
      fontFamily: {
        display: [
          '"Baloo 2"',
          "ui-rounded",
          '"SF Pro Rounded"',
          "Geist",
          "system-ui",
          "sans-serif",
        ],
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
        // Signature deep shadow from the landing hero — used for raised/hovered
        // surfaces and floating chrome.
        lift: "0 24px 70px -30px rgba(30,27,46,0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
