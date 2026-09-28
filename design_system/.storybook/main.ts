import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type { StorybookConfig } from "@storybook/angular";

// Dependencies live in the Angular workspace; the catalogue lives at repo root.
const require = createRequire(resolve(process.cwd(), "package.json"));
const packagePath = (name: string) =>
  dirname(require.resolve(`${name}/package.json`));

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.ts"],
  framework: { name: packagePath("@storybook/angular"), options: {} },
  addons: [
    packagePath("@storybook/addon-docs"),
    packagePath("@storybook/addon-a11y"),
  ],
  core: { disableTelemetry: true },
  webpackFinal: async (config) => {
    config.resolve ??= {};
    // App-component stories supply in-memory services. Do not bundle the unused
    // OAuth SDK into the catalogue (its disposable helpers break Babel here).
    // Fail loudly if a fixture accidentally attempts authentication.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@atproto/oauth-client-browser$": resolve(
        process.cwd(),
        "../design_system/.storybook/oauth-unavailable.ts",
      ),
    };
    config.resolve.modules = [
      resolve(process.cwd(), "node_modules"),
      ...(config.resolve.modules ?? []),
    ];
    return config;
  },
};
export default config;
