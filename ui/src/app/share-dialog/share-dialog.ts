import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PostTarget } from '../compose/compose';
import { TargetAvailabilitySource } from '../compose/target-availability';
import { Status } from '../models';
import { FocusTrap } from '../a11y/focus-trap';
import { PageDiagnostics } from '../page-diagnostics';
import { shareBody } from './share-selection';
import { intentIdsFor, postTargetsFor } from './share-targets';
import { HugoSettings } from '../providers/hugo/hugo-settings';
import { PosseQueue } from '../providers/hugo/posse-queue';
import { canPosseOnly } from '../providers/provider';

export interface ShareContext {
  url: string;
  title: string;
  text: string;
}

export interface ShareDestination {
  id: string;
  labelKey: string;
  buildUrl(context: ShareContext): string;
}

const POST_TARGET_LABEL_KEYS: Record<PostTarget, string> = {
  fedi: 'shareDialog.destinations.mastodon',
  bsky: 'shareDialog.destinations.bluesky',
  both: 'shareDialog.destinations.mastodonAndBluesky',
  paste: 'shareDialog.destinations.pasteService',
  blog: 'shareDialog.destinations.mataroaBlog',
  blogger: 'shareDialog.destinations.blogger',
  hugo: 'shareDialog.destinations.hugoSite',
};

/** What the host should open the composer with. */
export interface ComposeShareRequest {
  target: PostTarget;
  text: string;
}

function plainText(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return (document.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function shortened(text: string, maximum: number): string {
  const characters = Array.from(text);
  return characters.length <= maximum ? text : `${characters.slice(0, maximum - 1).join('')}…`;
}

function urlWithParams(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url.toString();
}

/** Ordinary outbound links in a post, excluding mentions, hashtags, and the post permalink. */
export function shareableContentLinks(status: Status): string[] {
  const document = new DOMParser().parseFromString(status.content, 'text/html');
  let ownUrl: string | null = null;
  try {
    ownUrl = status.url ? new URL(status.url).toString() : null;
  } catch {
    // A malformed status URL cannot equal a valid outbound URL.
  }
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .filter(
      (anchor) => !anchor.classList.contains('mention') && !anchor.classList.contains('hashtag'),
    )
    .map((anchor) => {
      try {
        const url = new URL(anchor.getAttribute('href')!);
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
      } catch {
        return null;
      }
    })
    .filter((url): url is string => !!url && url !== ownUrl);
  return [...new Set(links)];
}

/**
 * Whether this status came from a feed rather than an account.
 *
 * The adapter builds RSS ids and account handles as `rss:<feedUrl>`, so the
 * account is synthetic. It has no `@handle` worth showing a human, and its
 * "post" is an article on somebody's site — both of which change what a share
 * should say.
 */
export function isFeedItem(status: Status): boolean {
  return status.id.startsWith('rss:') || (status.account.acct ?? '').startsWith('rss:');
}

export function shareContext(status: Status, url: string, quote = ''): ShareContext {
  const body = plainText(status.content);

  if (isFeedItem(status)) {
    // An article, not a post: the feed's title is the publisher and the link is
    // the article itself. `From @rss:https://…` would be nonsense.
    const title = status.account.display_name || 'Article';
    return {
      url,
      title,
      text: shareBody({ quote: quote || undefined, title: shortened(body, 180), url }),
    };
  }

  const account = status.account.acct || status.account.username;
  if (quote) {
    return {
      url,
      title: `Post by @${account}`,
      text: shareBody({ quote, title: `From @${account}`, url }),
    };
  }
  return {
    url,
    title: `Post by @${account}`,
    text: shortened(body ? `From @${account}: ${body}` : `From @${account}`, 220),
  };
}

function blueskyText(text: string, url: string): string {
  // The URL is already in `text` when a quote built it; don't append it twice.
  if (text.includes(url)) {
    return shortened(text, 300);
  }
  const suffix = `\n\n${url}`;
  return `${shortened(text, Math.max(1, 300 - Array.from(suffix).length))}${suffix}`;
}

export const SHARE_DESTINATIONS: ShareDestination[] = [
  {
    id: 'reddit',
    labelKey: 'shareDialog.destinations.reddit',
    buildUrl: ({ url, title }) => urlWithParams('https://www.reddit.com/submit', { url, title }),
  },
  {
    id: 'bluesky',
    labelKey: 'shareDialog.destinations.bluesky',
    buildUrl: ({ url, text }) =>
      urlWithParams('https://bsky.app/intent/compose', {
        text: blueskyText(text, url),
      }),
  },
  {
    id: 'tumblr',
    labelKey: 'shareDialog.destinations.tumblr',
    buildUrl: ({ url, title, text }) =>
      urlWithParams('https://www.tumblr.com/widgets/share/tool', {
        canonicalUrl: url,
        title,
        caption: text,
      }),
  },
  {
    id: 'linkedin',
    labelKey: 'shareDialog.destinations.linkedIn',
    buildUrl: ({ url }) =>
      urlWithParams('https://www.linkedin.com/sharing/share-offsite/', { url }),
  },
  {
    id: 'hacker-news',
    labelKey: 'shareDialog.destinations.hackerNews',
    buildUrl: ({ url, title }) =>
      urlWithParams('https://news.ycombinator.com/submitlink', { u: url, t: title }),
  },
];

/**
 * Destinations that carry a quote through, and those that cannot.
 *
 * Reddit, LinkedIn and Hacker News take a URL and a title — there is no field a
 * highlighted passage could go in. The dialog says so rather than letting the
 * quote vanish silently, because a user who highlighted a paragraph and pressed
 * Reddit is owed the information that it did not travel.
 */
const QUOTE_CARRYING_INTENTS = new Set(['bluesky', 'tumblr']);

// i18n shareDialog.closeDialog: Close share dialog
// i18n shareDialog.heading.article: Share this article
// i18n shareDialog.heading.elsewhere: Share elsewhere
// i18n shareDialog.articleHint: Going out as <strong>{{host}}</strong>. Pick where to send it.
// i18n shareDialog.chooseHint: Choose what to share, then where to send it.
// i18n shareDialog.share: Share
// i18n shareDialog.thisPost: This post
// i18n shareDialog.linkedPage: Linked page (without the post wrapper)
// i18n shareDialog.alsoRecord: Also record this on my blog
// i18n shareDialog.recordHint: Queues a boost for your own site. Nothing is published until you say so.
// i18n shareDialog.postIt: Post it
// i18n shareDialog.postHint: Opens a composer. Nothing is posted until you press Post.
// i18n shareDialog.sendItTo: Send it to
// i18n shareDialog.sendHint: Opens the destination in a new tab.
// i18n shareDialog.shareUsingDevice: Share using device…
// i18n shareDialog.linkCopied: Link copied!
// i18n shareDialog.copyLink: Copy link
// i18n shareDialog.quoteDropped: Some of these take only a link — your highlight won’t travel.
// i18n shareDialog.copyError: Couldn’t copy the link. Please try again.
// i18n shareDialog.destinations.reddit: Reddit
// i18n shareDialog.destinations.bluesky: Bluesky
// i18n shareDialog.destinations.tumblr: Tumblr
// i18n shareDialog.destinations.linkedIn: LinkedIn
// i18n shareDialog.destinations.hackerNews: Hacker News
// i18n shareDialog.destinations.mastodon: Mastodon
// i18n shareDialog.destinations.mastodonAndBluesky: Mastodon and Bluesky
// i18n shareDialog.destinations.pasteService: Paste service
// i18n shareDialog.destinations.mataroaBlog: Mataroa blog
// i18n shareDialog.destinations.blogger: Blogger
// i18n shareDialog.destinations.hugoSite: Hugo site

@Component({
  selector: 'app-share-dialog',
  imports: [FocusTrap, TranslocoPipe],
  templateUrl: './share-dialog.html',
  styleUrl: './share-dialog.css',
})
export class ShareDialog {
  private diagnostics = inject(PageDiagnostics);
  private availability = inject(TargetAvailabilitySource);
  private hugo = inject(HugoSettings);
  private posse = inject(PosseQueue);

  readonly status = input.required<Status>();
  /**
   * Text the user had highlighted when they pressed Share.
   *
   * Passed in rather than read here: opening a modal moves focus and collapses
   * the selection, so by the time this component exists there is nothing left to
   * read. See `share-selection.ts`.
   */
  readonly quote = input('');
  readonly closed = output<void>();
  /** Asks the host to open a composer — the dialog never posts anything itself. */
  readonly compose = output<ComposeShareRequest>();

  /**
   * Whether this is a feed article rather than a post — the picker turns on it.
   *
   * A Mastodon post is a wrapper: "hey, check out example.com" behind a link
   * that may want a login, a follow, and an approved follow request before it
   * shows you the one sentence it had. Offering to share the *linked page*
   * instead is a real and useful choice there.
   *
   * A feed article is not a wrapper. Its URL already **is** the article on the
   * publisher's site, so "this post" and "the link, unwrapped" name the same
   * page — a choice between two identical things, which is not a choice.
   */
  protected readonly feedItem = computed(() => isFeedItem(this.status()));

  protected readonly contentLinks = computed(() =>
    // Suppressed for feed articles: the outbound links in an article's body are
    // things the *article* links to, not a wrapper around it, so presenting them
    // as "share this instead" misreads what the reader is holding.
    this.feedItem() ? [] : shareableContentLinks(this.status()),
  );
  protected selectedUrl = signal('');
  protected copied = signal(false);
  protected copyFailed = signal(false);
  protected readonly canShareUsingDevice = typeof navigator.share === 'function';

  /** Everywhere a real post can be made right now, in section order. */
  protected readonly postTargets = computed(() => postTargetsFor(this.availability.current()));

  /** The hand-off destinations left after connectors claimed theirs. */
  protected readonly intents = computed(() => {
    const ids = new Set(
      intentIdsFor(
        SHARE_DESTINATIONS.map((d) => d.id),
        this.availability.current(),
      ),
    );
    return SHARE_DESTINATIONS.filter((destination) => ids.has(destination.id));
  });

  /** True when a quote exists but some destination on screen cannot carry it. */
  protected readonly quoteMayBeDropped = computed(
    () => !!this.quote() && this.intents().some((d) => !QUOTE_CARRYING_INTENTS.has(d.id)),
  );

  /**
   * Whether "also record this on my blog" is on offer.
   *
   * Same test the action bar uses: a POSSE-enabled Hugo connection, a provider
   * with no network of its own to boost on, and a URL to record. It rides along
   * in this dialog rather than as a button in the bar because on a feed item
   * sharing and recording are the same intention expressed twice — you are
   * telling people about the article, and telling your own site you did.
   */
  protected readonly canRecordOnBlog = computed(
    () =>
      this.hugo.posseEnabled() &&
      // Either tag qualifies. `provider` is optional on a Status and the RSS
      // adapter is not the only thing that builds one, so a feed item is also
      // recognised by its `rss:` id — the same shape `isFeedItem` keys on.
      (canPosseOnly(this.status().provider) || this.feedItem()) &&
      !!this.status().url &&
      !this.posse.has('repost', this.status().url!),
  );

  /** Ticked by the reader; acted on when they actually send the share. */
  protected recordOnBlog = signal(false);

  /**
   * Write the POSSE entry, if it was asked for.
   *
   * Called from every path that completes a share, and only from those: ticking
   * the box and then closing the dialog records nothing, because the reader
   * never went through with the share it was attached to.
   */
  private recordIfAsked(): void {
    if (!this.recordOnBlog() || !this.canRecordOnBlog()) {
      return;
    }
    this.posse.add('repost', this.status());
  }

  protected targetLabelKey(target: PostTarget): string {
    return POST_TARGET_LABEL_KEYS[target];
  }

  protected targetUrl(): string {
    return this.selectedUrl() || this.status().url || '';
  }

  protected host(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  /**
   * Hand a prefilled composer to the host.
   *
   * Deliberately not a post: one press must never publish. The composer is where
   * the user sees what is about to go out and presses Post themselves.
   */
  protected postTo(target: PostTarget): void {
    const url = this.targetUrl();
    const context = shareContext(this.status(), url, this.quote());
    // The intent destinations take a URL as their own parameter, so the legacy
    // context text does not have to carry one. A composer has only this string —
    // a post that mentions an article without linking it is the whole point
    // missed, so make sure the link is in the body.
    const text = context.text.includes(url) ? context.text : `${context.text}\n\n${url}`;
    this.diagnostics.info('Share', 'compose', { target });
    this.recordIfAsked();
    this.compose.emit({ target, text });
    this.closed.emit();
  }

  protected open(destination: ShareDestination): void {
    const url = destination.buildUrl(shareContext(this.status(), this.targetUrl(), this.quote()));
    window.open(url, '_blank', 'noopener,noreferrer');
    this.recordIfAsked();
    this.closed.emit();
  }

  protected async shareUsingDevice(): Promise<void> {
    const context = shareContext(this.status(), this.targetUrl(), this.quote());
    try {
      await navigator.share(context);
      this.recordIfAsked();
      this.closed.emit();
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.closed.emit();
        return;
      }
      this.diagnostics.error('Share', 'native-share:error', error);
    }
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.targetUrl());
      this.recordIfAsked();
      this.copyFailed.set(false);
      this.copied.set(true);
    } catch (error: unknown) {
      this.diagnostics.error('Share', 'clipboard:error', error);
      this.copyFailed.set(true);
      this.copied.set(false);
    }
  }
}
