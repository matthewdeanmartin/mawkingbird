import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../platform/api/models';
import { HugoSettings } from '../../connections/hugo/hugo-settings';
import { PosseQueue } from '../../connections/hugo/posse-queue';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import {
  RepostOptions,
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

  it('offers "My blog" as a destination that records, and un-records, the boost', () => {
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
    const blog = () =>
      Array.from(element.querySelectorAll<HTMLButtonElement>('.destination')).find((button) =>
        button.textContent?.includes('blog'),
      )!;

    // Says "my blog" where a second bare 🔁 in the action bar once said nothing.
    expect(blog().textContent?.trim()).toBe('My blog');
    blog().click();
    fixture.detectChanges();
    expect(queue.entries()).toEqual([
      expect.objectContaining({ kind: 'repost', targetUrl: 'https://blog.example/posts/hello/' }),
    ]);
    expect(blog().textContent?.trim()).toBe('Recorded on my blog ✓');
    expect(blog().getAttribute('aria-pressed')).toBe('true');

    blog().click();
    fixture.detectChanges();
    expect(queue.count()).toBe(0);
  });

  it('does not offer to record on a blog that is not connected', () => {
    const fixture = TestBed.createComponent(ShareDialog);
    fixture.componentRef.setInput('status', feedArticle());
    fixture.detectChanges();

    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.destination'),
    ).map((button) => button.textContent?.trim());
    expect(labels).not.toContain('My blog');
    expect(labels.length).toBeGreaterThan(0);
  });

  describe('as the repost dialog', () => {
    function repost(options: RepostOptions | null) {
      const fixture = TestBed.createComponent(ShareDialog);
      fixture.componentRef.setInput('status', status());
      fixture.componentRef.setInput('repost', options);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const choices = () =>
        Array.from(element.querySelectorAll<HTMLButtonElement>('.choice strong')).map((n) =>
          n.textContent?.trim(),
        );
      return { fixture, element, choices };
    }

    it('opens on page 1 in the reader’s own word, then turns to the destinations and back', () => {
      TestBed.inject(ClientPrefs).postNoun.set('tweet');
      const { fixture, element, choices } = repost({ boost: 'boost', quote: true });
      expect(element.querySelector('h3')?.textContent?.trim()).toBe('Retweet');
      expect(choices()).toEqual(['Retweet', 'Quote', 'Cross-platform retweet…']);
      expect(element.querySelector('.destinations')).toBeNull();

      element.querySelectorAll<HTMLButtonElement>('.choice')[2].click();
      fixture.detectChanges();
      expect(element.querySelector('.destinations')).not.toBeNull();
      element.querySelector<HTMLButtonElement>('.back')!.click();
      fixture.detectChanges();
      expect(choices()).toHaveLength(3);
    });

    it('hands Boost, Undo and Quote back to the post', () => {
      const { fixture, element, choices } = repost({ boost: 'undo', quote: true });
      expect(choices()[0]).toBe('Undo boost');
      const boosted = vi.fn();
      const quoted = vi.fn();
      fixture.componentInstance.boost.subscribe(boosted);
      fixture.componentInstance.quoteRequested.subscribe(quoted);
      const [boost, quote] = element.querySelectorAll<HTMLButtonElement>('.choice');
      boost.click();
      quote.click();
      expect(boosted).toHaveBeenCalledOnce();
      expect(quoted).toHaveBeenCalledOnce();
    });

    it('opens straight on the destinations when page 1 has nothing, as for Anonymous', () => {
      const { element } = repost(null);
      expect(element.querySelector('.choices')).toBeNull();
      expect(element.querySelector('.back')).toBeNull();
      expect(element.querySelector('.destinations')).not.toBeNull();
    });
  });

  it('sends to Twitter through its own composer, with the link and any highlight', () => {
    const fixture = TestBed.createComponent(ShareDialog);
    fixture.componentRef.setInput('status', status());
    fixture.componentRef.setInput('quote', 'A line worth sharing');
    fixture.detectChanges();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.destination'),
    )
      .find((button) => button.textContent?.trim() === 'Twitter')!
      .click();
    const url = new URL(String(open.mock.calls[0][0]));
    open.mockRestore();
    expect(url.origin + url.pathname).toBe('https://twitter.com/intent/tweet');
    expect(url.searchParams.get('url')).toBe(status().url);
    expect(url.searchParams.get('text')).toContain('A line worth sharing');
  });

  /** Destinations that post through one of your own accounts. */
  function postButtons(element: HTMLElement): string[] {
    return Array.from(element.querySelectorAll<HTMLButtonElement>('.destination.post')).map(
      (button) => button.textContent?.trim() ?? '',
    );
  }

  /** Destinations that hand off to another site. */
  function intentButtons(element: HTMLElement): string[] {
    return Array.from(
      element.querySelectorAll<HTMLButtonElement>('.destination:not(.post):not(.native)'),
    ).map((button) => button.textContent?.trim() ?? '');
  }

  /** A post that lives on Bluesky, so Mastodon is somewhere else to send it. */
  function blueskyPost(): Status {
    return {
      ...status(),
      id: 'bsky:at://did:plc:alice/app.bsky.feed.post/1',
      provider: 'bluesky',
      url: 'https://bsky.app/profile/alice.bsky.social/post/1',
    };
  }

  function open(
    quote = '',
    post: Status = status(),
  ): ReturnType<typeof TestBed.createComponent<ShareDialog>> {
    const fixture = TestBed.createComponent(ShareDialog);
    fixture.componentRef.setInput('status', post);
    fixture.componentRef.setInput('quote', quote);
    fixture.detectChanges();
    return fixture;
  }

  it('never offers a post back to its own network: that is what Boost and Quote are for', () => {
    // A Mastodon post, a signed-in Mastodon reader: Mastodon is not a destination.
    expect(postButtons(open().nativeElement)).not.toContain('Mastodon');
    // A Bluesky post: neither the Bluesky composer nor the bsky.app hand-off.
    const bluesky = open('', blueskyPost()).nativeElement as HTMLElement;
    expect(postButtons(bluesky)).not.toContain('Bluesky');
    expect(intentButtons(bluesky)).not.toContain('Bluesky');
    // A tweet: no Twitter hand-off.
    const tweet = open('', {
      ...status(),
      id: 'twitter:1',
      provider: 'twitter',
      url: 'https://twitter.com/a/status/1',
    }).nativeElement as HTMLElement;
    expect(intentButtons(tweet)).not.toContain('Twitter');
  });

  it('offers the other network: a Bluesky post can go to your Mastodon account', () => {
    expect(postButtons(open('', blueskyPost()).nativeElement)).toContain('Mastodon');
  });

  it('keeps Bluesky as an intent while it is unlinked', () => {
    // Not linked in this TestBed, so the hand-off is the only thing that works.
    const element = open().nativeElement as HTMLElement;
    expect(intentButtons(element)).toContain('Bluesky');
    expect(postButtons(element)).not.toContain('Bluesky');
  });

  it('never lists a service in both sections', () => {
    const element = open('', blueskyPost()).nativeElement as HTMLElement;
    const overlap = postButtons(element).filter((label) => intentButtons(element).includes(label));
    expect(overlap).toEqual([]);
  });

  it('lists every destination together, with no section headings or how-it-works notes', () => {
    const element = open('', blueskyPost()).nativeElement as HTMLElement;
    expect(element.querySelectorAll('.destinations')).toHaveLength(1);
    expect(element.querySelector('h4')).toBeNull();
    expect(element.textContent).not.toContain('Opens a composer');
    expect(element.textContent).not.toContain('new tab');
  });

  it('emits a compose request rather than posting anything itself', () => {
    const fixture = open('', blueskyPost());
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
    expect(requests[0].text).toContain('https://bsky.app/profile/alice.bsky.social/post/1');
  });

  it('shows a highlighted passage and carries it into the compose text', () => {
    const fixture = open('the highlighted passage', blueskyPost());
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
