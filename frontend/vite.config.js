import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run dev` serves the UI on :5173 and forwards /api to the Python server.
// `npm run build:demo` makes a static copy (relative paths, own folder) for GitHub Pages.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "demo" ? "./" : "/",
  build: { outDir: mode === "demo" ? "dist-demo" : "dist" },
  server: { host: "127.0.0.1", port: 5173, proxy: { "/api": "http://127.0.0.1:8000" } },
}));
