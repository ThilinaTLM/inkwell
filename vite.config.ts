import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During `vite dev` we proxy /api to a locally-running Worker (`wrangler dev`).
// In production the Worker serves the built SPA directly via the [assets] binding.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  define: {
    // Excalidraw expects this to be set; using "production" silences its dev warning
    // when running the prod build. In `vite dev` Vite will override it to "development".
    "process.env.IS_PREACT": JSON.stringify("false"),
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    // Excalidraw is large; bumping the warning limit avoids noise.
    chunkSizeWarningLimit: 2000,
  },
});
