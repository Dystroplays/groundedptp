import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({mode})=>({
  plugins: [react()],
  define:mode==='test'?{'import.meta.env.VITE_CONVEX_URL':'""'}:{},
  build: { chunkSizeWarningLimit: 900 },
}));
