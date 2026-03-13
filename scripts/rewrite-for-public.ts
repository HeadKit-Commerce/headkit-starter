#!/usr/bin/env bun
/**
 * Rewrites package.json workspace dependencies to npm versions for the public mirror.
 * Run from the split branch root (where package.json is at ./package.json).
 * Requires HEADKIT_SDK_VERSION env var.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const sdkVersion = process.env.HEADKIT_SDK_VERSION;
if (!sdkVersion) {
  console.error("HEADKIT_SDK_VERSION env var is required");
  process.exit(1);
}

const pkgPath = join(process.cwd(), "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
  dependencies?: Record<string, string>;
};

const workspaceDeps: Record<string, string> = {
  "@headkit/sdk": `^${sdkVersion}`,
};

let modified = false;
for (const [name, version] of Object.entries(workspaceDeps)) {
  if (pkg.dependencies?.[name]?.startsWith("workspace:")) {
    pkg.dependencies[name] = version;
    modified = true;
  }
}

if (modified) {
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log("Rewrote workspace deps for public mirror");
} else {
  console.log("No workspace deps to rewrite");
}
