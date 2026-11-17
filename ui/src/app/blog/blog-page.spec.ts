import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, Status } from '../platform/api/models';
import { BlogPage } from './blog-page';
import { LIVE_STEP_PAGES } from './blog-source';
import { BlogAuthor, BlogSource } from './blog-source';
import { BlogCache } from './blog-cache';

const account = {
  id: '7',
  acct: 'alice@far.example',
  username: 'alice',
  display_name: 'Alice',
  avatar: '',
  url: 'https://far.example/@alice',
} as Account;
const author: BlogAuthor = { handle: 'alice@far.example', account, via: 'local' };

let minute = 0;
function post(id: string, content: string, replyTo: string | null = null): Status {
  minute++;
  return {
    id,
    created_at: new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString(),
    content,
    spoiler_text: '',
    visibility: 'public',
    account,
    in_reply_to_id: replyTo,
    in_reply_to_account_id: replyTo ? '7' : null,
    reblog: null,
  } as Status;
}

describe('BlogPage', () => {
  const source = {
    resolve: vi.fn(),
    page: vi.fn(),
    pager: vi.fn(),
    ownHandle: vi.fn(),
    remember: vi.fn(),
  };
  let pagerKind: 'live' | 'archive' = 'live';
  let params: BehaviorSubject<ParamMap>;
  let data: Record<string, unknown>;

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    pagerKind = 'live';
    // A pager over the stubbed pages, as BlogSource builds one.
    source.pager.mockImplementation((author: BlogAuthor) => ({
      stepPages: LIVE_STEP_PAGES,
      kind: pagerKind,
      next: () => source.page(author),
      cursor: () => undefined,
    }));
    params = new BehaviorSubject(convertToParamMap({ handle: '@alice@far.example' }));
    data = {};
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BlogSource, useValue: source },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params,
            get snapshot() {
              return { data };
            },
          },
        },
      ],
    });
  });

  async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    for (let i = 0; i < 4; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  async function render() {
    const fixture = TestBed.createComponent(BlogPage);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lists storms and long posts, newest first, and links them to their pages', async () => {
    const storm = [
      post('1', '<p>On bees<br>Bees dance.</p>'),
      post('2', `<p>Two ${'word '.repeat(40)}</p>`, '1'),
      post('3', `<p>Three ${'word '.repeat(40)}</p>`, '2'),
    ];
    const chatter = post('4', '<p>Lunch was good</p>');
    const essay = post('5', `<p>A long one<br>${'word '.repeat(300)}</p>`);
    source.resolve.mockResolvedValue(author);
    source.page.mockResolvedValueOnce([essay, chatter, ...storm.reverse()]).mockResolvedValue([]);

    const { el } = await render();
    const titles = [...el.querySelectorAll('article h2 a')].map((a) => a.textContent?.trim());
    expect(titles).toEqual(['A long one', 'On bees']);
    // No public URL on these fixtures, so no portable id: the reader is the fallback.
    expect(el.querySelector('article h2 a')?.getAttribute('href')).toBe('/read/5');
    expect(source.remember).toHaveBeenLastCalledWith(
      'alice@far.example',
      expect.arrayContaining([expect.objectContaining({ title: 'On bees' })]),
    );
    expect(el.textContent).toContain('3 posts');
    expect(el.textContent).toContain('Blog posts from all 5 public posts.');
    expect(el.textContent).toContain('Read through your own server');
    expect(el.textContent).not.toContain('Look further back');
  });

  it(`reads ${LIVE_STEP_PAGES} pages per step and offers to look further back`, async () => {
    source.resolve.mockResolvedValue(author);
    let n = 100;
    source.page.mockImplementation(async () => [post(String(n--), '<p>short</p>')]);
    const { fixture, el } = await render();
    expect(source.page).toHaveBeenCalledTimes(LIVE_STEP_PAGES);
    expect(el.textContent).toContain('Blog posts from the latest 5 posts.');
    expect(el.textContent).toContain('No blog posts yet');

    const more = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Look further back'),
    )!;
    more.click();
    await settle(fixture);
    expect(source.page).toHaveBeenCalledTimes(LIVE_STEP_PAGES * 2);
    expect(source.pager).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('the latest 10 posts');
  });

  it('says "archived" when the posts come from the Native archive', async () => {
    pagerKind = 'archive';
    source.resolve.mockResolvedValue({ ...author, via: 'archive' });
    source.page.mockResolvedValueOnce([post('1', '<p>hi</p>')]).mockResolvedValue([]);
    const { el } = await render();
    expect(el.textContent).toContain('Blog posts from all 1 archived posts');
    expect(el.textContent).not.toContain('Read through your own server');
  });

  it('points a moved account to its new blog, and offers Write on your own', async () => {
    const moved = { ...account, acct: 'alice@new.example', url: 'https://new.example/@alice' };
    source.resolve.mockResolvedValue({ ...author, account: { ...account, moved } });
    source.page.mockResolvedValue([]);
    source.ownHandle.mockReturnValue('Alice@far.example');
    const { el } = await render();
    expect(el.textContent).toContain('Alice has moved to a new account.');
    expect(el.querySelector('a[href="/blog/@alice@new.example"]')).not.toBeNull();
    expect(el.querySelector('.head-links a[href="/write"]')).not.toBeNull();
  });

  it('opens a blog read in the last four hours without a request, and saves new reads', async () => {
    const cached = post('1', `<p>Cached essay<br>${'word '.repeat(300)}</p>`);
    await TestBed.inject(BlogCache).put('alice@far.example', {
      author,
      statuses: [cached],
      exhausted: true,
    });
    const { el } = await render();
    expect(source.resolve).not.toHaveBeenCalled();
    expect(source.page).not.toHaveBeenCalled();
    expect(el.querySelector('article h2 a')?.textContent?.trim()).toBe('Cached essay');
  });

  it('explains a handle without a server', async () => {
    params.next(convertToParamMap({ handle: 'alice' }));
    source.resolve.mockRejectedValue(new Error('not-a-handle'));
    const { el } = await render();
    expect(el.textContent).toContain('That is not a full handle');
  });

  it('explains a server that will not answer', async () => {
    source.resolve.mockRejectedValue(new Error('401'));
    const { el } = await render();
    expect(el.textContent).toContain("Couldn't open this blog");
    expect(el.textContent).toContain('far.example');
  });

  it('opens your own blog at /blog/me, or asks you to sign in', async () => {
    data = { mine: true };
    source.ownHandle.mockReturnValue(null);
    const first = await render();
    expect(first.el.textContent).toContain('Sign in to see your own blog');

    source.ownHandle.mockReturnValue('alice@far.example');
    source.resolve.mockResolvedValue(author);
    source.page.mockResolvedValue([]);
    await render();
    expect(source.resolve).toHaveBeenCalledWith('alice@far.example');
  });
});
