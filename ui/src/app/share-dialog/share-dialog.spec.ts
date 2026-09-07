import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../models';
import { HugoSettings } from '../providers/hugo/hugo-settings';
import { PosseQueue } from '../providers/hugo/posse-queue';
import {
  SHARE_DESTINATIONS,
  ShareDialog,
  shareContext,
  shareableContentLinks,
} from './share-dialog';

function status(content = '<p>Hello world</p>'): Status {
  return {
    id: '1',
    created_at: '2026-01-01T00:00:00Z',
    edited_at: null,
    content,
    spoiler_text: '',
    visibility: 'public',
    url: 'https://social.example/@alice/1',
    account: {
      id: 'a',
      username: 'alice',
      acct: 'alice@social.example',
      display_name: 'Alice',
      note: '',
      url: 'https://social.example/@alice',
      avatar: '',
      avatar_static: '',
      header: '',
      followers_count: 0,
      following_count: 0,
      statuses_count: 1,
      bot: false,
      locked: false,
      fields: [],
    },
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
  };
}

describe('ShareDialog', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [ShareDialog] }));

  it('finds outbound links but not mentions, hashtags, or the post permalink', () => {
    const post = status(`
      <p>
        <a class="mention" href="https://social.example/@bob">@bob</a>
        <a class="hashtag" href="https://social.example/tags/news">#news</a>
        <a href="https://social.example/@alice/1">post</a>
        <a href="https://example.com/story">story</a>
        <a href="https://example.com/story">same story</a>
      </p>`);

    expect(shareableContentLinks(post)).toEqual(['https://example.com/story']);
  });

  it('builds encoded destination URLs and preserves the full Bluesky target URL', () => {
    const context = shareContext(status('<p>A useful story</p>'), 'https://example.com/a?x=1');
    const reddit = new URL(
      SHARE_DESTINATIONS.find((item) => item.id === 'reddit')!.buildUrl(context),
    );
    const bluesky = new URL(
      SHARE_DESTINATIONS.find((item) => item.id === 'bluesky')!.buildUrl(context),
    );

    expect(reddit.searchParams.get('url')).toBe('https://example.com/a?x=1');
    expect(reddit.searchParams.get('title')).toBe('Post by @alice@social.example');
    expect(bluesky.searchParams.get('text')).toContain('https://example.com/a?x=1');
  });

  it('offers wrapper removal only when the post contains an outbound link', () => {
    const withoutLink = TestBed.createComponent(ShareDialog);
    withoutLink.componentRef.setInput('status', status());
    withoutLink.detectChanges();
    expect(withoutLink.nativeElement.textContent).not.toContain('without the post wrapper');

    const withLink = TestBed.createComponent(ShareDialog);
    withLink.componentRef.setInput(
      'status',
      status('<p>Read <a href="https://example.com/story">this</a></p>'),
    );
    withLink.detectChanges();
    expect(withLink.nativeElement.textContent).toContain('without the post wrapper');
  });

  it('opens the chosen service with the linked page instead of the post wrapper', () => {
    const fixture = TestBed.createComponent(ShareDialog);
    fixture.componentRef.setInput(
      'status',
      status('<p>Read <a href="https://example.com/story">this</a></p>'),
    );
    fixture.detectChanges();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const element = fixture.nativeElement as HTMLElement;
    const linkedPage = element.querySelectorAll<HTMLInputElement>('input[name="share-target"]')[1];
    linkedPage.click();
    // Specifically an intent button: `.destination` now also covers the "Post it"
    // section, whose buttons open a composer rather than a new tab.
    const reddit = Array.from(
      element.querySelectorAll<HTMLButtonElement>('.destination:not(.post)'),
    ).find((button) => button.textContent?.trim() === 'Reddit')!;
    reddit.click();

    const opened = new URL(String(open.mock.calls[0][0]));
    expect(opened.searchParams.get('url')).toBe('https://example.com/story');
    open.mockRestore();
  });

  /** The same article, as the RSS adapter builds it: a feed id and a synthetic account. */
  function feedArticle(
    content = '<p>Read <a href="https://example.com/story">this</a></p>',
  ): Status {
    const article = status(content);
    return {
      ...article,
      id: 'rss:https://blog.example/feed.xml::1',
      url: 'https://blog.example/posts/hello/',
      account: {
        ...article.account,
        acct: 'rss:https://blog.example/feed.xml',
        display_name: 'The Blog',
      },
    };
  }

  it('never offers wrapper removal on a feed article', () => {
    // On a Mastodon post "this post" and "the linked page" are different pages,
    // and unwrapping saves the reader a login-and-follow dance to see one line
    // of "hey, check out example.com". A feed item has no wrapper: its URL
    // already is the article, so the two options named the same thing.
    const fixture = TestBed.createComponent(ShareDialog);
    fixture.componentRef.setInput('status', feedArticle());
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).not.toContain('without the post wrapper');
    expect(element.querySelectorAll('input[name="share-target"]').length).toBe(0);
    // ...and says what is actually going out instead of asking an unanswerable
    // question about it.
    expect(element.textContent).toContain('Share this article');
    expect(element.textContent).toContain('blog.example');
  });

  it('shares the article URL from a feed item with no choice to get wrong', () => {
    const fixture = TestBed.createComponent(ShareDialog);
    fixture.componentRef.setInput('status', feedArticle());
    fixture.detectChanges();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const element = fixture.nativeElement as HTMLElement;

    Array.from(element.querySelectorAll<HTMLButtonElement>('.destination:not(.post)'))
      .find((button) => button.textContent?.trim() === 'Reddit')!
      .click();

    const opened = new URL(String(open.mock.calls[0][0]));
    expect(opened.searchParams.get('url')).toBe('https://blog.example/posts/hello/');
    open.mockRestore();
  });

  it('records a POSSE boost only when the share actually goes through', () => {
    TestBed.inject(HugoSettings).connect('tok', {
      owner: 'me',
      repo: 'blog',
      branch: 'main',
      contentPath: 'content',
      posse: true,
    } as never);
    const queue = TestBed.inject(PosseQueue);
    const fixture = TestBed.createComponent(ShareDialog);
    fixture.componentRef.setInput('status', feedArticle());
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    // The opt-in replaces the second bare 🔁 that used to sit in the action bar,
    // and says "my blog" where that symbol said nothing.
    const box = element.querySelector<HTMLInputElement>('.also-record input')!;
    expect(element.textContent).toContain('Also record this on my blog');
    box.click();
    fixture.detectChanges();

    // Ticking it is not the act. Nothing is recorded until the share happens.
    expect(queue.count()).toBe(0);

    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    Array.from(element.querySelectorAll<HTMLButtonElement>('.destination:not(.post)'))
      .find((button) => button.textContent?.trim() === 'Reddit')!
      .click();
    open.mockRestore();

    expect(queue.count()).toBe(1);
    expect(queue.entries()[0]).toMatchObject({
      kind: 'repost',
      targetUrl: 'https://blog.example/posts/hello/',
    });
  });

  it('does not offer to record on a blog that is not connected', () => {
    const fixture = TestBed.createComponent(ShareDialog);
    fixture.componentRef.setInput('status', feedArticle());
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.also-record')).toBeNull();
  });

  /** Buttons in the "Post it" section. */
  function postButtons(element: HTMLElement): string[] {
    return Array.from(element.querySelectorAll<HTMLButtonElement>('.destination.post')).map(
      (button) => button.textContent?.trim() ?? '',
    );
  }

  /** Buttons in the "Send it to" section. */
  function intentButtons(element: HTMLElement): string[] {
    return Array.from(
      element.querySelectorAll<HTMLButtonElement>('.destination:not(.post):not(.native)'),
    ).map((button) => button.textContent?.trim() ?? '');
  }

  function open(quote = ''): ReturnType<typeof TestBed.createComponent<ShareDialog>> {
    const fixture = TestBed.createComponent(ShareDialog);
    fixture.componentRef.setInput('status', status());
    fixture.componentRef.setInput('quote', quote);
    fixture.detectChanges();
    return fixture;
  }

  it('offers Mastodon in the post section for a signed-in user', () => {
    expect(postButtons(open().nativeElement)).toContain('Mastodon');
  });

  it('keeps Bluesky as an intent while it is unlinked', () => {
    // Not linked in this TestBed, so the hand-off is the only thing that works.
    const element = open().nativeElement as HTMLElement;
    expect(intentButtons(element)).toContain('Bluesky');
    expect(postButtons(element)).not.toContain('Bluesky');
  });

  it('never lists a service in both sections', () => {
    const element = open().nativeElement as HTMLElement;
    const overlap = postButtons(element).filter((label) => intentButtons(element).includes(label));
    expect(overlap).toEqual([]);
  });

  it('emits a compose request rather than posting anything itself', () => {
    const fixture = open();
    const requests: { target: string; text: string }[] = [];
    fixture.componentInstance.compose.subscribe((request) => requests.push(request));

    const mastodon = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.destination.post',
      ),
    ).find((button) => button.textContent?.trim() === 'Mastodon')!;
    mastodon.click();

    // One press must never publish: the composer is where the user presses Post.
    expect(requests).toHaveLength(1);
    expect(requests[0].target).toBe('fedi');
    expect(requests[0].text).toContain('https://social.example/@alice/1');
  });

  it('shows a highlighted passage and carries it into the compose text', () => {
    const fixture = open('the highlighted passage');
    const requests: { text: string }[] = [];
    fixture.componentInstance.compose.subscribe((request) => requests.push(request));

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('the highlighted passage');

    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.destination.post',
      ),
    )
      .find((button) => button.textContent?.trim() === 'Mastodon')!
      .click();

    expect(requests[0].text).toContain('> the highlighted passage');
  });

  it('warns that a highlight will not reach link-only destinations', () => {
    // Reddit, LinkedIn and Hacker News take a URL and a title; someone who
    // highlighted a paragraph is owed that fact.
    expect((open('a passage').nativeElement as HTMLElement).textContent).toContain('won’t travel');
  });

  it('says nothing about highlights when there is no highlight', () => {
    expect((open().nativeElement as HTMLElement).textContent).not.toContain('won’t travel');
  });

  it('builds an article-shaped context for a feed item, with no synthetic handle', () => {
    const article = status('<p>The article body</p>');
    article.id = 'rss:https://blog.test/feed.xml::1';
    article.account.acct = 'rss:https://blog.test/feed.xml';
    article.account.display_name = 'The Blog';
    article.url = 'https://blog.test/post';

    const context = shareContext(article, article.url!, 'a quoted line');

    expect(context.title).toBe('The Blog');
    // `From @rss:https://…` is not something to show a human.
    expect(context.text).not.toContain('rss:');
    expect(context.text).toContain('> a quoted line');
    expect(context.text).toContain('https://blog.test/post');
  });

  it('does not repeat the url when a quote already carried it into Bluesky text', () => {
    const bluesky = SHARE_DESTINATIONS.find((d) => d.id === 'bluesky')!;
    const url = 'https://social.example/@alice/1';
    const built = new URL(bluesky.buildUrl(shareContext(status(), url, 'a passage')));
    const text = built.searchParams.get('text')!;

    expect(text.split(url).length - 1).toBe(1);
  });
});
