import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Wrangler's default local dev port for the Worker (`wrangler dev`).
      "/api": "http://localhost:8787",
    },
  },
});
