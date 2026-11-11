import { describe, expect, it } from 'vitest';
import {
  ENGLISH_TOOLS,
  FOCUSED_TOOL_GROUPS,
  TOOL_PAGES,
  TRANSLATED_PATHS,
  languageFolder,
  toolLanguage,
  toolVersions,
} from './focused-tools';
import { FOCUSED_TOOLS, TOOL_COPY } from './focused-tools-all';
import { withCopy } from './tool-copy';

describe('FOCUSED_TOOLS', () => {
  it('gives every tool its own id, path, title and description', () => {
    for (const field of ['id', 'path', 'title', 'description'] as const) {
      const values = FOCUSED_TOOLS.map((tool) => tool[field]);
      expect(new Set(values).size, field).toBe(values.length);
    }
  });

  it('uses plain path segments the sitemap and canonical URLs can be built from', () => {
    for (const tool of FOCUSED_TOOLS) {
      // English at the root; every other language in its own folder: /de/<slug>.
      const lang = toolLanguage(tool);
      const folder = lang === 'en' ? '' : `${languageFolder(lang)}/`;
      expect(tool.path.startsWith(folder), tool.path).toBe(true);
      expect(tool.path.slice(folder.length), tool.path).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
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

  it('gives every translated path its words, and words only to translated paths', () => {
    expect(Object.keys(TOOL_COPY).sort()).toEqual(Object.keys(TRANSLATED_PATHS).sort());
    const englishIds = ENGLISH_TOOLS.map((tool) => tool.id);
    for (const [lang, paths] of Object.entries(TRANSLATED_PATHS)) {
      const words = TOOL_COPY[lang as keyof typeof TOOL_COPY];
      expect(Object.keys(words).sort(), lang).toEqual(Object.keys(paths).sort());
      for (const id of Object.keys(paths)) expect(englishIds, `${lang} ${id}`).toContain(id);
    }
    expect(TOOL_PAGES.map((page) => page.path)).toEqual(FOCUSED_TOOLS.map((tool) => tool.path));
  });

  it('loads the same words in the browser, one language at a time, as the server has', async () => {
    for (const page of TOOL_PAGES)
      expect(await withCopy(page), page.path).toEqual(
        FOCUSED_TOOLS.find((tool) => tool.path === page.path),
      );
  });

  it('files every tool under a /tools heading', () => {
    const groups = FOCUSED_TOOL_GROUPS.map((group) => group.id);
    for (const tool of FOCUSED_TOOLS) expect(groups, tool.path).toContain(tool.group);
  });
});
