import { describe, expect, it } from 'vitest';
import { audienceContent } from './audience-content';
import { audienceRoutes } from './audience-routes';

describe('audience and comparison pages', () => {
  it('has copy for every route, and a route for every page of copy', () => {
    const keys = audienceRoutes.map((route) => route.data?.['audience']);
    expect(new Set(keys)).toEqual(new Set(Object.keys(audienceContent)));
  });

  it('fills every comparison row for every column, and dates the table', () => {
    for (const [key, page] of Object.entries(audienceContent)) {
      if (!page.comparison) continue;
      expect(page.comparison.checked, key).toMatch(/\d{4}/);
      for (const row of page.comparison.rows) {
        expect(row.cells.length, `${key}: ${row.label}`).toBe(page.comparison.columns.length);
      }
    }
  });

  it('links each comparison page to all the others, with trailing slashes', () => {
    const comparePaths = audienceRoutes
      .filter((route) => route.path?.startsWith('compare'))
      .map((route) => `/${route.path}/`);
    expect(comparePaths).toHaveLength(9);
    for (const route of audienceRoutes.filter((r) => r.path?.startsWith('compare'))) {
      const links = (audienceContent[route.data?.['audience']].guides ?? []).map((g) => g.href);
      for (const path of comparePaths.filter((path) => path !== `/${route.path}/`)) {
        expect(links, `${route.path} links to ${path}`).toContain(path);
      }
    }
  });
});
