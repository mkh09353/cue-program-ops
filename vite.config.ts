import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "^/e/.*/public(/.*)?$": "http://localhost:8787",
      "/api": "http://localhost:8787",
      "/public": "http://localhost:8787",
      "/embed": "http://localhost:8787",
      "/health": "http://localhost:8787",
      "/demo": "http://localhost:8787",
      "/sync": "http://localhost:8787",
    },
  },
});
