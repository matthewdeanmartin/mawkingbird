import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../auth';
import { ClientPrefs } from '../client-prefs';
import { ProviderId } from '../models';
import { ProviderRegistry } from '../providers/provider-registry';

/** What the host page is showing in place of its timeline. */
export type FeedView = 'feed' | 'members' | 'analytics' | 'media' | 'articles';

/**
 * The timeline command bar: Go Live (owned by the host page), plus the global
 * feed toggles — Reader mode, images on/off, and text size (shown in reader).
 * Reader/images are ClientPrefs, so every timeline honours them at once.
 * Pages that merge foreign providers (home) also get per-provider filter chips.
 */
@Component({
  selector: 'app-command-bar',
  imports: [RouterLink],
  template: `
    <div class="command-bar" role="toolbar" aria-label="Feed controls">
      @if (providerChips() && hasSourceControls()) {
        <!-- WHAT: networks included in this feed. The label is intentionally a
             code comment rather than visible toolbar furniture. -->
        <div class="command-row provider-group" role="group" aria-label="Feed sources">
          @if (!auth.isAnonymous && !auth.isBlueskyPrimary) {
            <button
              class="btn command-item"
              [class.active]="prefs.isProviderVisible('mastodon')"
              (click)="toggleProvider('mastodon')"
              title="Show or hide Mastodon posts"
            >
              🦣 Fedi
            </button>
          }
          @if (anonymousFedi()) {
            <button
              class="btn command-item"
              [class.active]="prefs.isProviderVisible('anonymous-mastodon')"
              (click)="toggleProvider('anonymous-mastodon')"
              title="Show or hide Fediverse posts"
            >
              🦣 Fedi
            </button>
          }
          @for (p of sourceProviders(); track p.id) {
            <button
              class="btn command-item"
              [class.active]="prefs.isProviderVisible(p.id)"
              (click)="toggleProvider(p.id)"
              [title]="'Show or hide ' + p.label + ' posts'"
            >
              {{ p.badge }}
            </button>
          }
        </div>
      }

      <!-- HOW: ways to load or present the same feed. The row name stays in
           source only; the controls themselves are the visible explanation. -->
      <div class="command-row action-row">
        <!-- "Go live" used to sit here. It is now Blue → "Auto-refresh timeline",
             opt-in and off by default. Home reads the pref directly. -->
        @if (showRefresh()) {
          <button
            class="btn command-item"
            (click)="refresh.emit()"
            title="Reload the feed from the newest posts"
          >
            🔄 More
          </button>
        }
        <button
          class="btn command-item"
          [class.active]="prefs.feedReader()"
          (click)="prefs.setFeedReader(!prefs.feedReader())"
          title="Reader mode for the feed: reader typography, no pictures"
        >
          📖 Reader
        </button>
        @if (showImages()) {
          <button
            class="btn command-item"
            [class.active]="imagesHidden()"
            (click)="toggleImages()"
            [title]="imagesHidden() ? 'Show images' : 'Hide images (show 🖼️ chips instead)'"
          >
            🖼️ {{ imagesHidden() ? 'No images' : 'Images' }}
          </button>
        }
        @if (showFeedViews()) {
          <!-- Views over the feed the page already has, not navigation: they swap
             what the timeline area shows, so they read as toggles like the rest
             of the bar. -->
          <span class="command-group" role="group" aria-label="Feed views">
            <button
              class="btn command-item"
              [class.active]="view() === 'members'"
              [attr.aria-pressed]="view() === 'members'"
              (click)="setView('members')"
              title="Who is in this feed — the accounts whose posts are loaded"
            >
              👥 Members
            </button>
            <button
              class="btn command-item"
              [class.active]="view() === 'analytics'"
              [attr.aria-pressed]="view() === 'analytics'"
              (click)="setView('analytics')"
              title="Analytics for the posts currently loaded in this feed"
            >
              📊 Analytics
            </button>
            <button
              class="btn command-item"
              [class.active]="view() === 'media'"
              [attr.aria-pressed]="view() === 'media'"
              (click)="setView('media')"
              title="Pictures and videos from the posts currently loaded"
            >
              🖼️ Media
            </button>
            <button
              class="btn command-item"
              [class.active]="view() === 'articles'"
              [attr.aria-pressed]="view() === 'articles'"
              (click)="setView('articles')"
              title="Article links from the posts currently loaded"
            >
              🔗 Articles
            </button>
            <!-- A link, not a view toggle like its two neighbours: the Doctor
               re-samples the feed itself so it works the same whether you arrive
               from here, from the end-of-feed line, or by typing the URL. One
               page, one implementation. -->
            @if (showFeedDoctor()) {
              <a
                class="btn command-item"
                routerLink="/feed-doctor"
                title="Why is this feed like this — who is flooding it, and why it ended"
              >
                🩺 Feed Doctor
              </a>
            }
          </span>
        }
        <ng-content />
        @if (prefs.feedReader() && showReaderControls()) {
          <span class="font-controls">
            <button
              class="btn command-item btn-sm"
              (click)="prefs.setReaderFontSize(prefs.readerFontSize() - 1)"
              title="Smaller text"
            >
              A−
            </button>
            <button
              class="btn command-item btn-sm"
              (click)="prefs.setReaderFontSize(prefs.readerFontSize() + 1)"
              title="Larger text"
            >
              A+
            </button>
          </span>
        }
      </div>
    </div>
  `,
  styles: `
    .command-bar {
      border-bottom: 1px solid var(--border);
    }
    .command-row {
      display: flex;
      align-items: center;
      gap: 2px;
      min-width: 0;
      padding: 5px 10px;
      overflow-x: auto;
    }
    .provider-group {
      flex-wrap: nowrap;
      border-bottom: 1px solid var(--border);
    }
    .action-row {
      flex-wrap: nowrap;
    }
    .action-row .command-item {
      padding: 5px 4px;
      font-size: 13px;
    }
    .command-group {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .command-item {
      flex: 0 0 auto;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: var(--text);
      padding: 6px 8px;
      white-space: nowrap;
    }
    .command-item:hover {
      background: var(--hover);
    }
    .command-item.active {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .font-controls {
      display: inline-flex;
      gap: 2px;
    }
    .btn-sm {
      padding: 4px 7px;
      font-size: 0.85em;
    }
  `,
})
export class CommandBar {
  protected readonly auth = inject(Auth);
  protected readonly prefs = inject(ClientPrefs);
  protected readonly registry = inject(ProviderRegistry);

  /** WHAT row in its deliberate network order; utility providers are not feed networks. */
  protected readonly sourceProviders = computed(() => {
    const order = new Map<ProviderId, number>([
      ['bluesky', 0],
      ['rss', 1],
      ['twitter', 2],
    ]);
    return this.registry
      .linked()
      .filter((provider) => order.has(provider.id))
      .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  });

  /** Anonymous Mastodon is the Fedi network too; only the storage id differs. */
  protected readonly anonymousFedi = computed(() =>
    this.registry.linked().some((provider) => provider.id === 'anonymous-mastodon'),
  );

  protected readonly hasSourceControls = computed(
    () =>
      (!this.auth.isAnonymous && !this.auth.isBlueskyPrimary) ||
      this.anonymousFedi() ||
      this.sourceProviders().length > 0,
  );

  /**
   * Whether to show a manual refresh button — for pages where live streaming
   * is off by default and re-clicking the nav link is the only other way to
   * fetch newer posts.
   */
  readonly showRefresh = input(false);
  /** Whether this page merges foreign providers (home) — shows the filter chips. */
  readonly providerChips = input(false);
  /** Images live in Home's compact filter row; other feeds keep them here. */
  readonly showImages = input(true);
  /** Home owns a fourth, full Reader row; compact feed bars retain these buttons. */
  readonly showReaderControls = input(true);
  /** Show the 👥 Members / 📊 Analytics view toggles (Home). */
  readonly showFeedViews = input(false);
  /**
   * Whether to offer Feed Doctor. Off by default: the Doctor diagnoses the
   * browser-local Home feed, so it means nothing on a hashtag or list timeline
   * that has no follow sources to report on.
   */
  readonly showFeedDoctor = input(false);
  /** Which view the host page is currently showing. */
  readonly view = input<FeedView>('feed');
  readonly refresh = output<void>();
  /** A source filter changed; merged feeds need to refetch their active sources. */
  readonly providerVisibilityChanged = output<void>();
  /** The viewer picked a different view of the feed. */
  readonly viewChange = output<FeedView>();

  /** Clicking the active view returns to the feed, so both buttons toggle. */
  protected setView(view: FeedView): void {
    this.viewChange.emit(this.view() === view ? 'feed' : view);
  }

  protected toggleProvider(id: ProviderId): void {
    this.prefs.toggleProvider(id);
    this.providerVisibilityChanged.emit();
  }

  /**
   * Images are effectively hidden when the viewer turned them off OR reader mode
   * is on (reader mode suppresses pictures). The button reflects reality so it
   * never looks inert.
   */
  protected imagesHidden(): boolean {
    return !this.prefs.showImages() || this.prefs.feedReader();
  }

  /**
   * One button, always recoverable: if images are hidden for any reason, reveal
   * them — turning images on AND leaving reader mode (whose whole point is no
   * pictures). Otherwise hide them. This avoids the trap where reader mode
   * silently overrode the images toggle, leaving no obvious way back.
   */
  protected toggleImages(): void {
    if (this.imagesHidden()) {
      this.prefs.setShowImages(true);
      if (this.prefs.feedReader()) {
        this.prefs.setFeedReader(false);
      }
    } else {
      this.prefs.setShowImages(false);
    }
  }
}
