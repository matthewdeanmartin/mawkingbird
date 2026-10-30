import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { FOCUSED_TOOL_GROUPS, FOCUSED_TOOLS } from '../../focused-tools';
import { ToolsIndex } from './tools-index';

describe('ToolsIndex', () => {
  it('links every registered tool once, under its heading', () => {
    TestBed.configureTestingModule({ imports: [ToolsIndex], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ToolsIndex);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    for (const tool of FOCUSED_TOOLS) {
      const links = root.querySelectorAll(`.tool-list a[href="/${tool.path}"]`);
      expect(links, tool.path).toHaveLength(1);
      const heading = links[0].closest('section')?.querySelector('h2')?.textContent;
      expect(heading).toBe(FOCUSED_TOOL_GROUPS.find((group) => group.id === tool.group)?.title);
    }
    expect(root.querySelectorAll('.tool-list a')).toHaveLength(FOCUSED_TOOLS.length);
  });
});
