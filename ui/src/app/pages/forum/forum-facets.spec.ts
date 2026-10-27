import { Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Discussion, discussionKey, summarize } from '../../forum/discussion';
import { NO_FACETS } from '../../forum/discussion-facets';
import { ForumScan } from '../../forum/forum-scan';
import { ForumView } from '../../forum/forum-view';
import { Status } from '../../models';
import { post, reply } from '../../testing/forum-fixtures';
import { ForumFacets } from './forum-facets';

@Component({ template: '' })
class Blank {}

function discussion(root: Status): Discussion {
  return {
    key: discussionKey(root),
    anchor: root,
    partial: false,
    posts: [root, reply(`${root.id}1`, 'x', root)],
    treeLoaded: true,
  };
}

describe('ForumFacets', () => {
  let found: ReturnType<typeof signal<Discussion[]>>;

  beforeEach(() => {
    found = signal([
      discussion(post('1', 'a', { tags: [{ name: 'rust', url: '' }], language: 'en' })),
      discussion(post('2', 'b', { tags: [{ name: 'rust', url: '' }], language: 'de' })),
    ]);
    TestBed.configureTestingModule({
      imports: [ForumFacets],
      providers: [
        provideRouter([{ path: 'forum', component: Blank }]),
        {
          provide: ForumScan,
          useValue: {
            listParams: { filter: ['asked'] },
            summaries: computed(() => found().map((each) => summarize(each, null, new Set()))),
          },
        },
      ],
    });
  });

  function mount(): HTMLElement {
    const fixture = TestBed.createComponent(ForumFacets);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows each facet with its counts', () => {
    const host = mount();
    const headings = [...host.querySelectorAll('h2')].map((h) => h.textContent!.trim());
    expect(headings).toEqual(['Hashtags', 'Started on', 'Language']);
    const rust = host.querySelector('button[aria-pressed]')!;
    expect(rust.textContent).toContain('#rust');
    expect(rust.textContent).toContain('2');
    expect(rust.getAttribute('aria-label')).toBe('#rust, 2 discussions');
  });

  it('puts a choice in the list URL, keeping the tab', async () => {
    const host = mount();
    (host.querySelector('button[aria-pressed]') as HTMLButtonElement).click();
    await TestBed.inject(Router).navigated;
    await new Promise((resolve) => setTimeout(resolve));
    expect(TestBed.inject(Router).url).toBe('/forum?filter=asked&tag=rust');
  });

  it('marks chosen values and offers to clear them', () => {
    TestBed.inject(ForumView).choice.set({ ...NO_FACETS, tag: ['rust'] });
    const host = mount();
    expect(host.querySelector('button[aria-pressed="true"]')!.textContent).toContain('#rust');
    expect(host.textContent).toContain('Clear filters');
  });

  it('says when there is nothing to filter by', () => {
    found.set([]);
    expect(mount().textContent).toContain('Nothing to filter by yet');
  });
});
