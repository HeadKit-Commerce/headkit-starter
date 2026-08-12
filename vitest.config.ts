import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // See lib/test-support/server-only-stub.ts: `server-only` is only real
      // via Next's webpack layer aliasing, not a resolvable/no-op package on
      // its own — vitest needs its own no-op stand-in.
      "server-only": path.resolve(
        __dirname,
        "lib/test-support/server-only-stub.ts",
      ),
    },
  },
});
