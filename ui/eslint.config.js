// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const designSystem = require('../design_system/rules/toolbar.cjs');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // New in angular-eslint 22's recommended set. The Angular 22 migration
      // marked ~900 existing components ChangeDetectionStrategy.Eager on purpose,
      // so they behave exactly as they did under 21; moving each to OnPush is a
      // behavior change to make (and test) component by component, not a lint
      // fix. New components get OnPush by default anyway. (2026-11-26)
      '@angular-eslint/prefer-on-push-component-change-detection': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    plugins: { mb: designSystem },
    rules: {
      'mb/no-pill-in-toolbar': 'error',
      'mb/require-shared-post-action': 'error',
      // Components that render a native control in their own (light) DOM, so a
      // wrapping <label> labels it exactly as it would a bare <select>.
      '@angular-eslint/template/label-has-associated-control': [
        'error',
        { controlComponents: ['app-language-select'] },
      ],
    },
  },
  {
    files: ['**/feeds/client-list/client-list-page.html'],
    rules: { 'mb/prefer-shared-local-tabs': 'error' },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Existing backdrop and card click handlers need keyboard-semantics work.
    // Keep the exception narrow so every new template receives the a11y rules.
    files: ['**/status-card.html'],
    rules: {
      '@angular-eslint/template/click-events-have-key-events': 'off',
      '@angular-eslint/template/interactive-supports-focus': 'off',
    },
  },
]);
