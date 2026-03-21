/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    exclude: ["e2e/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5568,
    strictPort: true,
    host: true,
    clearScreen: false,
    hmr: {
      host: "localhost",
    },
    proxy: {
      "/trpc": {
        target: "http://localhost:3000",
        changeOrigin: true,
        // Don't rewrite — tRPC expects /trpc prefix
      },
      "/media/images": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
