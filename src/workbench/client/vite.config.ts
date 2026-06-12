import { defineConfig } from "vite";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  build: {
    outDir: new URL("../../../dist/workbench", import.meta.url).pathname,
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": new URL("../../", import.meta.url).pathname,
    },
  },
});
