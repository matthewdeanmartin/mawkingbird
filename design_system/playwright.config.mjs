import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artifactRoot } from "../ui/scripts/artifacts.mjs";

const { defineConfig } = createRequire(
  new URL("../ui/package.json", import.meta.url),
)("@playwright/test");

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.browser.mjs",
  // Failure screenshots and traces, outside the working tree (artifacts.mjs).
  outputDir: path.join(artifactRoot, "design-system-browser"),
  forbidOnly: true,
  retries: 0,
  // Each test owns its browser context and artifact paths; schedule individual
  // tests so large catalogue files cannot leave the other workers idle.
  fullyParallel: true,
  // CI runners are small and split the suite into shards. Locally (20 logical
  // cores, 2026-11-11): 2 workers 7.6 min, 4 workers 4.1 min, 6 workers 3.7 min
  // but timing failures when the machine was also compiling. Four keeps
  // headroom. DESIGN_BROWSER_WORKERS overrides both.
  workers:
    Number(process.env.DESIGN_BROWSER_WORKERS) || (process.env.CI ? 2 : 4),
  // A dot per test and full detail for failures; VERBOSE=1 lists every test.
  reporter: process.env.VERBOSE ? "list" : "dot",
  use: {
    baseURL: "http://127.0.0.1:6008",
    browserName: "chromium",
    viewport: { width: 1280, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve-design-system.mjs",
    cwd: fileURLToPath(new URL("../ui", import.meta.url)),
    url: "http://127.0.0.1:6008/index.json",
    reuseExistingServer: false,
  },
});
