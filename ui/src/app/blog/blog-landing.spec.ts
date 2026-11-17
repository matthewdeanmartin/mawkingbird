import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, Status } from '../platform/api/models';
import { Draft, Drafts } from '../publishing/drafts';
import { BlogLanding } from './blog-landing';
import { BlogSource, LIVE_STEP_PAGES } from './blog-source';
import { BlogHistory } from './blog-history';

const me = { id: '1', acct: 'me', username: 'me', url: 'https://home.example/@me' } as Account;

let minute = 0;
function post(id: string, content: string, replyTo: string | null = null, replies = 0): Status {
  minute++;
  return {
    id,
    url: `https://home.example/@me/${id}`,
    created_at: new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString(),
    content,
    visibility: 'public',
    account: me,
    in_reply_to_id: replyTo,
    in_reply_to_account_id: replyTo ? '1' : null,
    replies_count: replies,
    reblog: null,
  } as unknown as Status;
}

describe('BlogLanding (the dashboard)', () => {
  const source = { ownHandle: vi.fn(), resolve: vi.fn(), pager: vi.fn(), remember: vi.fn() };
  const drafts = signal<Draft[]>([]);

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    drafts.set([]);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BlogSource, useValue: source },
        { provide: Drafts, useValue: { drafts } },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(BlogLanding);
    for (let i = 0; i < 4; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('greets a visitor without asking for a handle first', async () => {
    source.ownHandle.mockReturnValue(null);
    const { el } = await render();
    expect(el.querySelector('h1')?.textContent).toContain('Blog');
    expect(el.querySelector('a[href="/settings/blog"]')).not.toBeNull();
    expect(el.textContent).not.toContain('1250');
    // The handle form is folded away in the back shed.
    const shed = el.querySelector('details.shed') as HTMLDetailsElement;
    expect(shed.open).toBe(false);
    expect(shed.querySelector('input[name="blog_handle"]')).not.toBeNull();
    expect(source.resolve).not.toHaveBeenCalled();
  });

  it('shows your blog at a glance, your recent posts with comments, and drafts', async () => {
    source.ownHandle.mockReturnValue('me@home.example');
    source.resolve.mockResolvedValue({ handle: 'me@home.example', account: me, via: 'local' });
    const storm = [
      post('1', '<p>Bees</p>', null, 3),
      post('2', '<p>b</p>', '1', 1),
      post('3', '<p>c</p>', '2'),
    ];
    const pages = [[...storm].reverse()];
    source.pager.mockReturnValue({
      stepPages: LIVE_STEP_PAGES,
      kind: 'live',
      next: async () => pages.shift() ?? [],
    });
    drafts.set([
      { id: 'd1', updatedAt: '2026-11-01', segments: ['Almost\nthere'] } as Draft,
      { id: 'd2', updatedAt: '2026-11-02', segments: ['BLOG: Ready'] } as Draft,
    ]);
    const { el } = await render();
    expect(el.textContent).toContain('1 blog posts in your latest 3 posts');
    expect(el.textContent).toContain('2 comments on them');
    const recent = el.querySelector('a[href="/blog/@me@home.example/1"]');
    expect(recent?.textContent?.trim()).toBe('Bees');
    expect(el.textContent).toContain('2 comments');
    const draftLinks = [...el.querySelectorAll('a[href^="/write?draft="]')];
    expect(draftLinks.map((a) => a.textContent?.trim())).toEqual(['Ready', 'Almost']);
    expect(el.textContent).toContain('ready to post as a blog post');
    expect(el.textContent).toContain('not a blog post yet');
  });

  it('lists recently read blogs', async () => {
    source.ownHandle.mockReturnValue(null);
    TestBed.inject(BlogHistory).record({ handle: 'a@far.example', name: 'Alice', avatar: '' });
    const { el } = await render();
    expect(el.querySelector('a[href="/blog/@a@far.example"]')?.textContent).toContain('Alice');
  });

  it('opens a full handle from the back shed and rejects a bare one', async () => {
    source.ownHandle.mockReturnValue(null);
    const { fixture, el } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const input = el.querySelector<HTMLInputElement>('input[name="blog_handle"]')!;
    const form = el.querySelector('form')!;
    input.value = '@alice';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(navigate).not.toHaveBeenCalled();
    input.value = 'Alice@Far.Example';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    expect(navigate).toHaveBeenCalledWith(['/blog', '@Alice@far.example']);
  });
});
