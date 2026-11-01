import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ENGLISH_TOOLS, FOCUSED_TOOL_GROUPS } from '../../focused-tools';
import { FOCUSED_TOOLS } from '../../focused-tools-all';
import { ToolsIndex } from './tools-index';

describe('ToolsIndex', () => {
  it('links every registered tool once, under its heading', () => {
    TestBed.configureTestingModule({ imports: [ToolsIndex], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ToolsIndex);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    // Each tool once, by its English page; translations have their own index.
    for (const tool of ENGLISH_TOOLS) {
      const links = root.querySelectorAll(`.tool-list a[href="/${tool.path}"]`);
      expect(links, tool.path).toHaveLength(1);
      const heading = links[0].closest('section')?.querySelector('h2')?.textContent;
      expect(heading).toBe(FOCUSED_TOOL_GROUPS.find((group) => group.id === tool.group)?.title);
    }
    expect(root.querySelectorAll('.tool-list a')).toHaveLength(ENGLISH_TOOLS.length);
    for (const translation of FOCUSED_TOOLS.filter((tool) => tool.translationOf))
      expect(root.querySelector(`.tool-list a[href="/${translation.path}"]`)).toBeNull();
  });
});
