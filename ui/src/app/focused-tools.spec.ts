import { describe, expect, it } from 'vitest';
import {
  ENGLISH_TOOLS,
  FOCUSED_TOOL_GROUPS,
  FOCUSED_TOOLS,
  toolLanguage,
  toolVersions,
} from './focused-tools';

describe('FOCUSED_TOOLS', () => {
  it('gives every tool its own id, path, title and description', () => {
    for (const field of ['id', 'path', 'title', 'description'] as const) {
      const values = FOCUSED_TOOLS.map((tool) => tool[field]);
      expect(new Set(values).size, field).toBe(values.length);
    }
  });

  it('uses plain path segments the sitemap and canonical URLs can be built from', () => {
    for (const { path } of FOCUSED_TOOLS) {
      expect(path).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('says who signs in, and what the SEO build must find on the page', () => {
    for (const tool of FOCUSED_TOOLS) {
      expect(['mastodon', 'any'], tool.path).toContain(tool.signIn);
      expect(tool.prerenderCheck.heading, tool.path).not.toBe('');
      expect(tool.prerenderCheck.copy, tool.path).not.toBe('');
      expect(tool.prerenderCheck.tool, tool.path).toMatch(/^app-[a-z-]+$/);
      // Search results cut descriptions off at roughly this length.
      expect(tool.description.length, tool.path).toBeLessThanOrEqual(200);
    }
  });

  it('ties each translated page to one English original it mirrors', () => {
    const byId = new Map(FOCUSED_TOOLS.map((tool) => [tool.id, tool]));
    const seen = new Set<string>();
    for (const tool of FOCUSED_TOOLS) {
      if (toolLanguage(tool) === 'en') {
        expect(tool.translationOf, tool.path).toBeUndefined();
        continue;
      }
      const original = byId.get(tool.translationOf ?? '');
      expect(original, `${tool.path} translates a known tool`).toBeDefined();
      expect(toolLanguage(original!), `${tool.path} translates an English page`).toBe('en');
      // Same tool, other words: the shell, sign-in and /tools heading must agree.
      expect(tool.tab, tool.path).toEqual(original!.tab);
      expect(tool.signIn, tool.path).toBe(original!.signIn);
      expect(tool.group, tool.path).toBe(original!.group);
      expect(tool.prerenderCheck.tool, tool.path).toBe(original!.prerenderCheck.tool);
      const key = `${original!.id}:${toolLanguage(tool)}`;
      expect(seen.has(key), `one ${toolLanguage(tool)} page for ${original!.id}`).toBe(false);
      seen.add(key);
      expect(toolVersions(tool).map((entry) => entry.id)).toContain(original!.id);
      expect(toolVersions(original!).map((entry) => entry.id)).toContain(tool.id);
    }
    expect(ENGLISH_TOOLS.every((tool) => toolLanguage(tool) === 'en')).toBe(true);
  });

  it('files every tool under a /tools heading', () => {
    const groups = FOCUSED_TOOL_GROUPS.map((group) => group.id);
    for (const tool of FOCUSED_TOOLS) expect(groups, tool.path).toContain(tool.group);
  });
});
