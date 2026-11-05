import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "apps/studio",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": process.env.VITE_API_PROXY ?? "http://127.0.0.1:4318",
      "/media": process.env.VITE_API_PROXY ?? "http://127.0.0.1:4318",
      "/download": process.env.VITE_API_PROXY ?? "http://127.0.0.1:4318",
    },
  },
  build: { outDir: "../../dist/studio", emptyOutDir: true },
});
