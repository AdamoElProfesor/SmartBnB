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
      // API_PROXY_TARGET=https://www.smartbnb.ch npm run dev uses the live API
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
