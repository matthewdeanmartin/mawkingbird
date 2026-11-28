import { Location } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map, Subscription } from 'rxjs';
import { MbAddBox } from '../../design-system/add-box/add-box';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { LinkTimeline } from '../../feeds/link-timeline/link-timeline';
import { searchPostsForLink } from '../../feeds/link-timeline/link-search';
import { Api } from '../../platform/api/api';
import { Status } from '../../platform/api/models';
import { Server } from '../../platform/http/server';
import { Auth } from '../../platform/session/auth';
import { StatusCard } from '../../posts/status-card/status-card';
import { Compose } from '../../publishing/compose/compose';
import { Drafts } from '../../publishing/drafts';
import { youtubeSource } from '../../reading/video-player/media-source';

// i18n pages.pagePanel.write: Write about this page
// i18n pages.pagePanel.writeAny: Write a post
// i18n pages.pagePanel.strayDraft: You have an unsent post about another page.
// i18n pages.pagePanel.continueDraft: Continue it
// i18n pages.pagePanel.discardDraft: Discard it
// i18n pages.pagePanel.posted: Posted.
// i18n pages.pagePanel.cancel: Cancel
// i18n pages.pagePanel.updateExtension: This sidebar needs a newer Mawkingbird for Firefox. Firefox updates add-ons on its own; to update now, open Add-ons and themes, choose the gear menu, then Check for Updates.
// i18n pages.pagePanel.mine: You posted about this page
// i18n pages.pagePanel.searchLabel: Search Mawkingbird
// i18n pages.pagePanel.searchPlaceholder: Posts, people, hashtags
// i18n pages.pagePanel.search: Search
// i18n pages.pagePanel.watch: Watch in Mawkingbird
// i18n pages.pagePanel.watchReplies: Watch with replies to your post
// i18n pages.pagePanel.watchHint: Post about this video to watch it with the replies to your post as its chat.

/** The composer's autosave slot for this panel: one, whatever page it is beside. */
export const PAGE_PANEL_DRAFT_CONTEXT = 'page-panel';

/**
 * How the Firefox extension's sidebar tells the panel which page is beside it:
 * `postMessage({ channel, type: 'page', url, title })` from the parent frame.
 * The panel says `{ channel, type: 'ready', version }` to its parent once it
 * can listen; each `page` carries the sidebar's `sidebarVersion`.
 */
export const PANEL_CHANNEL = 'mawkingbird-panel/1';
/**
 * Versions (extension/protocol.json; ui/scripts/check-extension-protocol.mjs
 * keeps them in step). 1: 0.7.0, no versions in messages. 2: `ready` says the
 * panel's version, `page` the sidebar's. Accept the version before ours, so the
 * site and the add-on can update in either order.
 */
export const PANEL_VERSION = 2;
export const MIN_SIDEBAR_VERSION = 1;

/** How many of the reader's own posts about the page to show. */
const MINE_LIMIT = 5;

export interface PanelPage {
  url: string;
  title: string;
}

/**
 * `/panel`: Mawkingbird beside another page, for the Firefox extension's
 * sidebar (spec/firefox-extension.md). No app chrome: write about the page, see
 * whether you already did, and see who else is talking about it.
 *
 * The sidebar loads this once and sends each page by `postMessage` as the
 * reader switches tabs, so the panel updates in place (no reload, no blink) and
 * the page's address never appears in any URL, where a request (or GitHub
 * Pages' 404 redirect, which turns `#…` into `?spa=…`) would carry it to a
 * server. A direct `?url=&title=` link still works.
 *
 * A tab with no web page gets actions, not a sentence: write a post, or search.
 *
 * Calls per page: the reader's own posts are one `from:me` search (two if the
 * full URL finds nothing), Mastodon sign-ins only; the "about this link" list is
 * LinkTimeline's. The composer mounts on demand, so a page glanced at leaves no
 * draft. A YouTube video also gets Watch, alone or with the replies to the
 * reader's post as its chat.
 */
@Component({
  selector: 'app-page-panel',
  imports: [
    Compose,
    FormsModule,
    LinkTimeline,
    MbAddBox,
    MbButton,
    MbControl,
    MbField,
    RouterLink,
    StatusCard,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './page-panel.html',
  styleUrl: './page-panel.css',
})
export class PagePanel {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly drafts = inject(Drafts);
  private readonly server = inject(Server);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);

  /**
   * The page beside the panel. `undefined` while an embedding sidebar hasn't
   * said yet (render nothing rather than flash a placeholder); `null` for a tab
   * with no web page.
   */
  protected readonly page = signal<PanelPage | null | undefined>(this.initialPage());
  /** The sidebar speaks an older version than this panel accepts. */
  protected readonly sidebarOutdated = signal(false);

  protected readonly url = computed(() => this.page()?.url ?? '');
  protected readonly title = computed(() => this.page()?.title ?? '');
  protected readonly host = computed(() => hostOf(this.url()));
  /** What the composer opens with: the page's title and link. */
  protected readonly seedText = computed(() =>
    [this.title(), this.url()].filter(Boolean).join('\n\n'),
  );

  protected readonly writing = signal(false);
  /** The composer is showing an older unsent post, so it must not be seeded. */
  protected readonly continuing = signal(false);
  protected readonly justPosted = signal(false);
  /** An unsent panel post about some other page, waiting for a decision. */
  protected readonly strayDraft = signal(false);
  protected searchQuery = '';

  /** Whether the reader is signed in to a Mastodon account that can search its own posts. */
  protected readonly canSearchMine = !this.auth.isAnonymous && !this.auth.isForeignPrimary;
  protected readonly mine = signal<Status[]>([]);
  private mineSearch: Subscription | null = null;

  /** The page's YouTube video id, when it is one. */
  protected readonly videoId = computed(() => youtubeSource(this.url())?.videoId ?? '');
  /** Watch for the video alone. */
  protected readonly watchParams = computed(() => ({ youtube: this.videoId() }));
  /**
   * Watch with the reader's post as the party's root, so its replies are the
   * chat. Ids from the home-server search (or the post just made) belong to the
   * home server, which is what `server` says.
   */
  protected readonly repliesParams = computed(() => {
    const post = this.mine()[0];
    const home = originOf(this.server.baseUrl());
    if (!post || !home || !this.videoId()) return null;
    return { post: post.id, server: home, youtube: this.videoId() };
  });

  constructor() {
    const onMessage = (event: MessageEvent) => this.receive(event);
    window.addEventListener('message', onMessage);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('message', onMessage);
      this.mineSearch?.unsubscribe();
    });
    if (this.embedded()) {
      window.parent.postMessage(
        { channel: PANEL_CHANNEL, type: 'ready', version: PANEL_VERSION },
        '*',
      );
    }

    // A new page: start over, without the last page's composer or results.
    effect(() => {
      const url = this.url();
      untracked(() => this.showPage(url));
    });
  }

  protected write(): void {
    this.continuing.set(false);
    this.justPosted.set(false);
    this.writing.set(true);
  }

  protected continueDraft(): void {
    this.strayDraft.set(false);
    this.continuing.set(true);
    this.writing.set(true);
  }

  protected discardDraft(): void {
    this.drafts.clearAutosave(PAGE_PANEL_DRAFT_CONTEXT);
    this.strayDraft.set(false);
  }

  /**
   * Cancel means cancel: close the composer and forget what was in it. (Its
   * autosave is for a closed browser, not a deliberate cancel.)
   */
  protected cancel(): void {
    this.writing.set(false);
    this.continuing.set(false);
    // The composer flushes its autosave as it goes; clear the slot after that.
    afterNextRender(() => this.drafts.clearAutosave(PAGE_PANEL_DRAFT_CONTEXT), {
      injector: this.injector,
    });
  }

  protected posted(status: Status): void {
    this.writing.set(false);
    this.continuing.set(false);
    this.justPosted.set(true);
    if (this.url()) this.mine.update((list) => [status, ...list.filter((s) => s.id !== status.id)]);
  }

  /** Search Mawkingbird, in a tab: the results need the whole app. */
  protected search(): void {
    const q = this.searchQuery.trim();
    if (!q) return;
    const path = this.router.serializeUrl(
      this.router.createUrlTree(['/search'], { queryParams: { q } }),
    );
    window.open(this.location.prepareExternalUrl(path), '_blank', 'noopener');
  }

  private showPage(url: string): void {
    this.writing.set(false);
    this.continuing.set(false);
    this.justPosted.set(false);
    this.strayDraft.set(this.hasStrayDraft(url));
    this.mine.set([]);
    this.mineSearch?.unsubscribe();
    this.mineSearch = null;
    if (url && this.canSearchMine) {
      this.mineSearch = searchPostsForLink(this.api, url, { prefix: 'from:me ', limit: MINE_LIMIT })
        .pipe(map((found) => found.slice(0, MINE_LIMIT)))
        .subscribe((found) => this.mine.set(found));
    }
  }

  /** Only the extension page framing this panel may say which page is beside it. */
  private receive(event: MessageEvent): void {
    if (!this.embedded() || event.source !== window.parent) return;
    if (!/^(moz|chrome)-extension:\/\//.test(event.origin)) return;
    const data = event.data as {
      channel?: unknown;
      type?: unknown;
      url?: unknown;
      title?: unknown;
      sidebarVersion?: unknown;
    };
    if (data?.channel !== PANEL_CHANNEL || data.type !== 'page') return;
    // 0.7.0's sidebar sent no version: that is version 1.
    const version = Number.isInteger(data.sidebarVersion) ? (data.sidebarVersion as number) : 1;
    this.sidebarOutdated.set(version < MIN_SIDEBAR_VERSION);
    this.page.set(pageFrom(data.url, data.title));
  }

  private embedded(): boolean {
    return typeof window !== 'undefined' && window.parent !== window;
  }

  /** From a `?url=&title=` link; else wait for the sidebar, or say there's no page. */
  private initialPage(): PanelPage | null | undefined {
    const query = this.route.snapshot.queryParamMap;
    const fromLink = pageFrom(query.get('url'), query.get('title'));
    if (fromLink) return fromLink;
    return this.embedded() ? undefined : null;
  }

  /** A saved panel draft that doesn't mention this page belongs to another one. */
  private hasStrayDraft(url: string): boolean {
    const saved = this.drafts.loadAutosave(PAGE_PANEL_DRAFT_CONTEXT);
    if (!saved) return false;
    const text = saved.segments.join('\n');
    if (text.trim() === '') return false;
    return !url || !text.includes(url);
  }
}

/** A web page to show, or null for anything else. */
function pageFrom(url: unknown, title: unknown): PanelPage | null {
  const href = typeof url === 'string' ? url.trim() : '';
  if (!/^https?:\/\//i.test(href)) return null;
  return { url: href, title: typeof title === 'string' ? title.trim().slice(0, 300) : '' };
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
