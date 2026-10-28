import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { Discussion, discussionKey } from '../../forum/discussion';
import { ForumScan } from '../../forum/forum-scan';
import { post, reply } from '../../testing/forum-fixtures';
import { ThreadPreload } from '../read/thread-preload';
import { Thread } from '../thread/thread';
import { ForumDiscussionPage } from './forum-discussion-page';

@Component({ selector: 'app-thread', template: '<p class="thread">thread</p>' })
class ThreadStub {}

describe('ForumDiscussionPage', () => {
  const root = post('1', 'a');
  const first = reply('2', 'b', root);
  const second = reply('3', 'c', root);
  const deep = reply('4', 'a', first);
  let found: Discussion | null;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function discussion(overrides: Partial<Discussion> = {}): Discussion {
    return {
      key: discussionKey(root),
      anchor: root,
      partial: false,
      posts: [root, first, second, deep],
      treeLoaded: true,
      ...overrides,
    };
  }

  beforeEach(() => {
    found = discussion();
    params = new BehaviorSubject(convertToParamMap({ id: '1' }));
    TestBed.configureTestingModule({
      imports: [ForumDiscussionPage],
      providers: [
        provideRouter([]),
        {
          provide: ForumScan,
          useValue: {
            listParams: { filter: 'asked', source: 'tag:rust' },
            discussion: (id: string) => (found?.anchor.id === id ? found : null),
            containing: (id: string) =>
              found?.posts.some((each) => each.id === id) ? found : null,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params, snapshot: { paramMap: params.value } },
        },
      ],
    });
    TestBed.overrideComponent(ForumDiscussionPage, {
      remove: { imports: [Thread] },
      add: { imports: [ThreadStub] },
    });
  });

  function mount(): HTMLElement {
    const fixture = TestBed.createComponent(ForumDiscussionPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('hands the whole tree to the thread page in reading order', () => {
    mount();
    const offered = TestBed.inject(ThreadPreload).take('1');
    expect(offered?.status.id).toBe('1');
    expect(offered?.ancestors).toEqual([]);
    expect(offered?.descendants.map((p) => p.id)).toEqual(['2', '4', '3']);
  });

  it('lets the thread page load a discussion whose tree was not fetched', () => {
    found = discussion({ treeLoaded: false });
    mount();
    expect(TestBed.inject(ThreadPreload).take('1')).toBeNull();
  });

  it('lets the thread page load a discussion the scan never found', () => {
    found = null;
    mount();
    expect(TestBed.inject(ThreadPreload).take('1')).toBeNull();
  });

  it('offers again when the route moves to another discussion', () => {
    mount();
    TestBed.inject(ThreadPreload).take('1');
    const other = post('7', 'x');
    found = { ...discussion(), key: discussionKey(other), anchor: other, posts: [other] };
    params.next(convertToParamMap({ id: '7' }));
    expect(TestBed.inject(ThreadPreload).take('7')?.status.id).toBe('7');
  });

  it('opens a reply within a discussion through the thread page, partial notice and all', () => {
    found = discussion({ partial: true });
    params.next(convertToParamMap({ id: '4' }));
    expect(mount().textContent).toContain('could not be reached');
    expect(TestBed.inject(ThreadPreload).take('4')).toBeNull();
    found = discussion();
  });

  it('goes back to the list as it was left', () => {
    const back = mount().querySelector<HTMLAnchorElement>('.back a')!;
    expect(back.getAttribute('href')).toBe('/forum?filter=asked&source=tag:rust');
  });

  it('says when the start of the conversation could not be reached', () => {
    found = discussion({ partial: true });
    expect(mount().textContent).toContain('could not be reached');
    found = discussion();
  });
});
