import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The dev API port is configurable so a second checkout (git worktree, review
 * branch) can run its own stack without colliding with the default 8787:
 *   PORT=8788 tsx src/dev.ts
 *   API_PORT=8788 vite --port 5199
 * Plain `npm run dev` behaviour is unchanged.
 */
const apiPort = Number(process.env.API_PORT || 8787);
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Only `/e/:slug/public/*` is proxied — `/e/:slug/cfp` is a SPA route.
      "^/e/.*/public(/.*)?$": apiTarget,
      "/api": apiTarget,
      "/public": apiTarget,
      "/embed": apiTarget,
      "/health": apiTarget,
      "/sync": apiTarget,
    },
  },
});
