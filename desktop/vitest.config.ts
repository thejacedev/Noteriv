import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The app imports its own modules as "@/...". Tests need the same alias, or
// any module that uses it cannot be loaded.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
