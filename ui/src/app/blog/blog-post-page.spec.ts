import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Compose } from '../publishing/compose/compose';
import { Auth } from '../platform/session/auth';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, Status } from '../platform/api/models';
import { BlogPostPage, commentsOf } from './blog-post-page';
import { BlogAuthor, BlogSource } from './blog-source';
import { BlogPost } from './blog-classifier';

const alice = {
  id: '7',
  acct: 'alice@far.example',
  username: 'alice',
  display_name: 'Alice',
  avatar: '',
  url: 'https://far.example/@alice',
} as Account;
const bob = { ...alice, id: '8', acct: 'bob@near.example', username: 'bob', display_name: 'Bob' };
const author: BlogAuthor = { handle: 'alice@far.example', account: alice, via: 'local' };

let minute = 0;
function post(
  id: string,
  content: string,
  by: Account = alice,
  replyTo: string | null = null,
  visibility = 'public',
): Status {
  minute++;
  return {
    id,
    url: `https://far.example/@alice/${id}`,
    created_at: new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString(),
    content,
    spoiler_text: '',
    visibility,
    account: by,
    in_reply_to_id: replyTo,
    in_reply_to_account_id: null,
    reblog: null,
    media_attachments: [],
    emojis: [],
  } as unknown as Status;
}

describe('commentsOf', () => {
  it('keeps public replies outside the chain, oldest first, marking the author', () => {
    const p1 = post('1', '<p>T</p>');
    const p2 = post('2', '<p>two</p>', alice, '1');
    const c1 = post('3', '<p>nice</p>', bob, '1');
    const a1 = post('4', '<p>thanks</p>', alice, '3');
    const hidden = post('5', '<p>dm</p>', bob, '1', 'direct');
    const comments = commentsOf([p1, p2, a1, c1, hidden], [p1, p2], '7');
    expect(comments.map((c) => c.status.id)).toEqual(['3', '4']);
    expect(comments[1]).toMatchObject({ byAuthor: true, replyingTo: 'Bob' });
    expect(comments[0].replyingTo).toBeNull();
  });

  it('ignores ancestors before the post', () => {
    const before = post('0', '<p>question</p>', bob);
    const p1 = post('1', '<p>T</p>', alice, '0');
    expect(commentsOf([before, p1], [p1], '7')).toEqual([]);
  });
});

/** Stands in for the real composer, which needs the whole posting stack. */
@Component({
  selector: 'app-compose',
  template: '<textarea [placeholder]="placeholder()"></textarea>',
})
class StubCompose {
  readonly inReplyToId = input<string | undefined>();
  readonly replyToHandle = input('');
  readonly compact = input(false);
  readonly placeholder = input('');
  readonly posted = output<Status>();
}

describe('BlogPostPage', () => {
  const source = {
    resolve: vi.fn(),
    thread: vi.fn(),
    remembered: vi.fn(),
    localStatusId: vi.fn(),
    ownHandle: vi.fn(),
  };
  let params: BehaviorSubject<ParamMap>;
  let signedIn = false;

  beforeEach(() => {
    vi.resetAllMocks();
    params = new BehaviorSubject(convertToParamMap({ handle: '@alice@far.example', id: '1' }));
    signedIn = false;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BlogSource, useValue: source },
        { provide: ActivatedRoute, useValue: { paramMap: params } },
        {
          provide: Auth,
          useValue: {
            get lacksMastodonToken() {
              return !signedIn;
            },
          },
        },
      ],
    });
    TestBed.overrideComponent(BlogPostPage, {
      remove: { imports: [Compose] },
      add: { imports: [StubCompose] },
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(BlogPostPage);
    for (let i = 0; i < 4; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the storm as one article, titled once, with comments below', async () => {
    const p1 = post('1', '<p>On bees<br>Bees dance.</p>');
    const p2 = post('2', '<p>They make honey.</p>', alice, '1');
    const c1 = post('3', '<p>Lovely</p>', bob, '2');
    source.resolve.mockResolvedValue(author);
    source.thread.mockResolvedValue({ status: p1, thread: [p1, p2, c1] });
    source.remembered.mockReturnValue(null);

    const el = await render();
    expect(source.thread).toHaveBeenCalledWith(author, '1');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('On bees');
    const body = el.querySelector('.body')!.textContent!;
    expect(body).not.toContain('On bees');
    expect(body).toContain('Bees dance.');
    expect(body).toContain('They make honey.');
    expect(el.textContent).toContain('2 posts');
    expect(el.querySelectorAll('.comment')).toHaveLength(1);
    expect(el.querySelector('.comment')!.textContent).toContain('Lovely');
    expect(el.querySelector('.neighbours')).toBeNull();
  });

  it('offers newer and older posts from the list the reader came from', async () => {
    const p1 = post('1', '<p>Middle</p>');
    const entry = (root: Status, title: string) => ({ id: root.id, root, title }) as BlogPost;
    source.resolve.mockResolvedValue(author);
    source.thread.mockResolvedValue({ status: p1, thread: [p1] });
    source.remembered.mockReturnValue([
      entry(post('9', '<p>Newest</p>'), 'Newest'),
      entry(p1, 'Middle'),
      entry(post('0', '<p>Oldest</p>'), 'Oldest'),
    ]);
    const el = await render();
    const links = [...el.querySelectorAll('.neighbours a')];
    expect(links.map((a) => a.textContent?.trim())).toEqual(['Newer: Newest', 'Older: Oldest']);
    expect(links[0].getAttribute('href')).toBe('/blog/@alice@far.example/9');
  });

  it('says "comment" once when there are none yet, and offers Reply on Mastodon without an account', async () => {
    const p1 = post('1', '<p>Lonely</p>');
    source.resolve.mockResolvedValue(author);
    source.thread.mockResolvedValue({ status: p1, thread: [p1] });
    source.remembered.mockReturnValue(null);
    const el = await render();
    const section = el.querySelector('.comments')!;
    expect(section.querySelector('h2')).toBeNull();
    expect(section.textContent!.trim()).toBe('Reply on Mastodon');
    expect(el.querySelector('.part-reply')).toBeNull();
  });

  it('replies in place: the box answers the last part, a comment Reply retargets it', async () => {
    signedIn = true;
    const p1 = post('1', '<p>T</p>');
    const p2 = post('2', '<p>two</p>', alice, '1');
    const c1 = post('3', '<p>Lovely</p>', bob, '2');
    source.resolve.mockResolvedValue(author);
    source.thread.mockResolvedValue({ status: p1, thread: [p1, p2, c1] });
    source.remembered.mockReturnValue(null);
    source.localStatusId.mockImplementation(async (_a: unknown, s: Status) => `L${s.id}`);
    const fixture = TestBed.createComponent(BlogPostPage);
    const settle = async () => {
      for (let i = 0; i < 4; i++) {
        await fixture.whenStable();
        fixture.detectChanges();
      }
    };
    await settle();
    const el = fixture.nativeElement as HTMLElement;
    const composer = () =>
      fixture.debugElement.query((d) => d.componentInstance instanceof StubCompose);
    expect(composer().componentInstance.inReplyToId()).toBe('L2');
    expect(el.querySelector('textarea')!.placeholder).toBe('Write a reply…');
    // Each storm part offers the thread for a remark on just that part.
    expect(el.querySelectorAll('.part-reply')).toHaveLength(2);
    expect(el.querySelector('.part-reply')!.getAttribute('href')).toBe('/statuses/1');

    (el.querySelector('.comment .reply') as HTMLButtonElement).click();
    await settle();
    expect(composer().componentInstance.inReplyToId()).toBe('L3');
    expect(el.textContent).toContain('Replying to Bob');

    composer().componentInstance.posted.emit(post('9', '<p>Thanks!</p>', bob, '3'));
    await settle();
    expect(el.querySelectorAll('.comment')).toHaveLength(2);
    expect(composer().componentInstance.inReplyToId()).toBe('L2');
  });

  it('explains a post that will not open', async () => {
    source.resolve.mockResolvedValue(author);
    source.thread.mockRejectedValue(new Error('not-found'));
    const el = await render();
    expect(el.textContent).toContain("Couldn't open this post");
  });
});
