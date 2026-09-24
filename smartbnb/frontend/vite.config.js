// vite.config.js
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,   // utile en LAN
    port: 5173,
    proxy: {
      // tout ce qui commence par /api ira vers ton backend Express
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
