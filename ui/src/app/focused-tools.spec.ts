import { describe, expect, it } from 'vitest';
import { FOCUSED_TOOL_GROUPS, FOCUSED_TOOLS } from './focused-tools';

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

  it('files every tool under a /tools heading', () => {
    const groups = FOCUSED_TOOL_GROUPS.map((group) => group.id);
    for (const tool of FOCUSED_TOOLS) expect(groups, tool.path).toContain(tool.group);
  });
});
