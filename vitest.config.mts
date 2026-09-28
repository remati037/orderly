import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    // The server runs in UTC on Vercel — test the date math the same way.
    env: { TZ: "UTC" },
  },
});
