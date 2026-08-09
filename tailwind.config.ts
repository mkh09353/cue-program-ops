import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/web/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12141A",
        canvas: "#F7F4EF",
        iris: "#5B5CFF",
        lime: "#C7F464",
        ok: "#1B7F4E",
        warn: "#B86E00",
        danger: "#C23B22",
        info: "#2F5DAB",
        ai: "#6E4BE2",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(18,20,26,0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
