import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const { defineConfig } = createRequire(
  new URL("../ui/package.json", import.meta.url),
)("@playwright/test");

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.browser.mjs",
  outputDir: "./test-results",
  forbidOnly: true,
  retries: 0,
  workers: 2,
  reporter: "list",
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
