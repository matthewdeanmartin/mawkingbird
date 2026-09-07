import { describe, expect, it } from 'vitest';
import { Route, Routes } from '@angular/router';
import { mockOnlyChildren, mockOnlySettingsChildren } from './mock-routes';
import {
  mockOnlyChildren as mockingbirdChildren,
  mockOnlySettingsChildren as mockingbirdSettingsChildren,
} from './mock-routes.mockingbird';
import { routes } from './app.routes';

/**
 * The boundary between the two products this source tree builds.
 *
 * Mocking Bird is a Mastodon client for real instances. The same tree also
 * builds the UI for the bundled `mastodon_mock` Python server, whose private
 * control plane lives under `/api/v1/_mock/*` — a namespace no real instance
 * serves. Pages that drive it cannot work in the standalone client, so its
 * build replaces this module with an empty one (angular.json
 * `fileReplacements`), and the lazy chunks are never emitted.
 *
 * Hiding the nav entries is *not* the same fix, and was the state before: the
 * routes still resolved, so a typed or bookmarked URL loaded a page whose every
 * request 404s, with nothing on screen explaining why. Removing the routes lets
 * such a URL fall through to the ordinary not-found flow instead.
 *
 * `scripts/check-mock-leakage.mjs` asserts the same property against the built
 * output; this asserts it against the route tables, where a failure names the
 * offending route instead of a minified chunk.
 */
describe('mock-only routes', () => {
  /** Depth-first collection of every `path` in a route tree. */
  function paths(list: Routes): string[] {
    const found: string[] = [];
    const walk = (routes: Routes): void => {
      for (const route of routes as Route[]) {
        if (route.path) found.push(route.path);
        if (route.children) walk(route.children);
      }
    };
    walk(list);
    return found;
  }

  it('are absent from the Mocking Bird build', () => {
    expect(mockingbirdChildren).toEqual([]);
    expect(mockingbirdSettingsChildren).toEqual([]);
  });

  it('cover the settings pages that need the mock control plane', () => {
    // Each of these reads or writes `/api/v1/_mock/*` and has no public
    // Mastodon equivalent: server settings and invites are web-UI only, and
    // follows/mutes/blocks CSV is an account-export download, not an endpoint.
    expect(paths(mockOnlySettingsChildren).sort()).toEqual(
      ['account', 'deletion', 'development', 'invites', 'notifications'].sort(),
    );
  });

  it('keeps the mock server able to reach its own control plane', () => {
    expect(paths(mockOnlyChildren)).toContain('dev/faults');
  });

  /**
   * Appearance is the deliberate exception, and the reason this is asserted
   * rather than left to memory: it *does* call the mock settings endpoint, but
   * only for rows it hides off-mock. The rest of it — theme, accent, undo-send —
   * is localStorage and works against any instance, so it stays a real page in
   * both builds rather than being swept up with its neighbours.
   */
  it('does not sweep up Appearance, which works against any instance', () => {
    expect(paths(mockOnlySettingsChildren)).not.toContain('appearance');
    expect(paths(routes)).toContain('appearance');
  });

  it('reaches the settings tree only by being spliced in from here', () => {
    // `app.routes.ts` composes these in, so they do appear in the assembled
    // table — that is the point. What must hold is that each arrives *only*
    // that way, and is not also hard-coded under settings, where the Mocking
    // Bird build would keep it.
    //
    // Compared within the settings subtree rather than across the whole table:
    // `notifications` is also a top-level route, and a different page entirely
    // (the Inbox, a core client feature). Only `/settings/notifications` — the
    // mock server's email preferences — belongs to this module.
    const settings = routes
      .flatMap((route) => route.children ?? [])
      .find((route) => route.path === 'settings');
    expect(settings).toBeDefined();
    const settingsPaths = paths(settings?.children ?? []);
    for (const path of paths(mockOnlySettingsChildren)) {
      expect(settingsPaths.filter((candidate) => candidate === path)).toHaveLength(1);
    }
  });
});
