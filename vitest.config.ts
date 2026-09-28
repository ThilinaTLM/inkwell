import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests cover pure logic only (keymap parsing, selection reducer,
// upload classification, naming rules). No DOM environment by default;
// a test that needs one can opt in with `// @vitest-environment jsdom`.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts", "worker/**/*.test.ts"],
    environment: "node",
    // Keep file-level state isolated; several suites exercise module-scoped stores.
    isolate: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
