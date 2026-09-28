import { fileURLToPath } from "node:url";

export default {
  rules: {
    "color-no-invalid-hex": true,
    "color-no-hex": [
      true,
      {
        message:
          "Use a theme token such as var(--text), var(--muted), or var(--ds-error-text). Define palette values only in design_system/tokens.css.",
      },
    ],
    "color-named": [
      "never",
      {
        message:
          "Use a semantic theme token instead of a named color. transparent and currentColor remain valid.",
      },
    ],
    "function-disallowed-list": [
      [
        "rgb",
        "rgba",
        "hsl",
        "hsla",
        "hwb",
        "lab",
        "lch",
        "oklab",
        "oklch",
        "color",
      ],
      {
        message:
          "Use a semantic theme token instead of a literal color function; token-based color-mix() is allowed.",
      },
    ],
    "declaration-no-important": true,
    "selector-disallowed-list": ["/::ng-deep/"],
  },
  overrides: [
    {
      files: [fileURLToPath(new URL("./tokens.css", import.meta.url))],
      rules: {
        "color-no-hex": null,
        "color-named": null,
        "function-disallowed-list": null,
      },
    },
  ],
};
