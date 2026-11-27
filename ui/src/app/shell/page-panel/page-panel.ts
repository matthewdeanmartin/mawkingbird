import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { MbButton } from '../../design-system/button/button';
import { LinkTimeline } from '../../feeds/link-timeline/link-timeline';
import { searchPostsForLink } from '../../feeds/link-timeline/link-search';
import { Api } from '../../platform/api/api';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { StatusCard } from '../../posts/status-card/status-card';
import { Compose } from '../../publishing/compose/compose';
import { Drafts } from '../../publishing/drafts';

// i18n pages.pagePanel.write: Write about this page
// i18n pages.pagePanel.strayDraft: You have an unsent post about another page.
// i18n pages.pagePanel.continueDraft: Continue it
// i18n pages.pagePanel.discardDraft: Discard it
// i18n pages.pagePanel.posted: Posted.
// i18n pages.pagePanel.mine: You posted about this page
// i18n pages.pagePanel.noPage: Open a web page to see what people are saying about it.

/** The composer's autosave slot for this panel: one, whatever page it is beside. */
export const PAGE_PANEL_DRAFT_CONTEXT = 'page-panel';

/** How many of the reader's own posts about the page to show. */
const MINE_LIMIT = 5;

/**
 * `/panel?url=&title=`: Mawkingbird beside another page, for the Firefox
 * extension's sidebar (spec/firefox-extension.md). No app chrome: write about
 * the page, see whether you already did, and see who else is talking about it.
 *
 * Calls: the reader's own posts are one `from:me` search (two if the full URL
 * finds nothing), only for a Mastodon sign-in; the "about this link" list is
 * LinkTimeline's (link timeline, then search). The composer mounts on demand,
 * so a page glanced at leaves no draft behind.
 */
@Component({
  selector: 'app-page-panel',
  imports: [Compose, LinkTimeline, MbButton, StatusCard, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './page-panel.html',
  styleUrl: './page-panel.css',
})
export class PagePanel {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly drafts = inject(Drafts);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap, {
    requireSync: true,
  });

  protected readonly url = computed(() => {
    const url = (this.params().get('url') ?? '').trim();
    return /^https?:\/\//i.test(url) ? url : '';
  });
  protected readonly title = computed(() =>
    (this.params().get('title') ?? '').trim().slice(0, 300),
  );
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
  protected readonly strayDraft = signal(this.hasStrayDraft());

  /** Whether the reader is signed in to a Mastodon account that can search its own posts. */
  protected readonly canSearchMine = !this.auth.isAnonymous && !this.auth.isForeignPrimary;
  protected readonly mine = signal<Status[]>([]);

  constructor() {
    const url = this.url();
    if (url && this.canSearchMine) {
      searchPostsForLink(this.api, url, { prefix: 'from:me ', limit: MINE_LIMIT })
        .pipe(map((found) => found.slice(0, MINE_LIMIT)))
        .subscribe((found) => this.mine.set(found));
    }
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

  protected posted(status: Status): void {
    this.writing.set(false);
    this.continuing.set(false);
    this.justPosted.set(true);
    this.mine.update((list) => [status, ...list.filter((s) => s.id !== status.id)]);
  }

  /** A saved panel draft that doesn't mention this page belongs to another one. */
  private hasStrayDraft(): boolean {
    const saved = this.drafts.loadAutosave(PAGE_PANEL_DRAFT_CONTEXT);
    if (!saved) return false;
    const text = saved.segments.join('\n');
    if (text.trim() === '') return false;
    return !this.url() || !text.includes(this.url());
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
