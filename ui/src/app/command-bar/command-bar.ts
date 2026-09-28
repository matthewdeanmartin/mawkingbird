import { Component, computed, inject, input, output } from '@angular/core';
import { MbToolbar, MbToolbarButton } from '../design-system/toolbar/toolbar';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Auth } from '../auth';
import { ClientPrefs } from '../client-prefs';
import { PrivateFollows } from '../private-follows';
import { FeatureFlags } from '../feature-flags';
import { ProviderId } from '../models';
import { ProviderRegistry } from '../providers/provider-registry';

/** What the host page is showing in place of its timeline. */
export type FeedView = 'feed' | 'members' | 'analytics' | 'media' | 'articles';

// i18n commandBar.textFocus.label: Text-focus
// i18n commandBar.tweetView: Tweet view
// i18n commandBar.textFocus.turnOff: Turn off text-focus and show images
// i18n commandBar.textFocus.turnOn: Turn on text-focus: show image icons and alt text

/**
 * The timeline command bar: Go Live (owned by the host page), plus the global
 * feed toggles — Reader mode, images on/off, and text size (shown in reader).
 * Reader/images are ClientPrefs, so every timeline honours them at once.
 * Pages that merge foreign providers (home) also get per-provider filter chips.
 */
@Component({
  selector: 'app-command-bar',
  imports: [RouterLink, TranslocoPipe, MbToolbar, MbToolbarButton],
  template: `
    <div class="command-bar" role="group" aria-label="Feed controls">
      <div class="command-row action-row" role="group" aria-label="Feed actions">
        @if (showRefresh() || showFeedViews()) {
          <mb-toolbar label="Feed actions" density="compact" embedded>
            @if (showRefresh()) {
              <button
                mbToolbarButton
                (click)="refresh.emit()"
                title="Reload the feed from the newest posts"
              >
                🔄 More
              </button>
            }
            @if (showFeedViews()) {
              <button
                mbToolbarButton
                [pressed]="view() === 'feed'"
                (click)="viewChange.emit('feed')"
              >
                {{ 'commandBar.tweetView' | transloco }}
              </button>
              <button
                mbToolbarButton
                [pressed]="view() === 'members'"
                (click)="setView('members')"
                title="Who is in this feed — the accounts whose posts are loaded"
              >
                👥 Members</button
              ><button
                mbToolbarButton
                [pressed]="view() === 'analytics'"
                (click)="setView('analytics')"
                title="Analytics for the posts currently loaded in this feed"
              >
                📊 Analytics
              </button>
            }
          </mb-toolbar>
        }
        @if (showFeedDoctor()) {
          <a
            class="btn command-item"
            routerLink="/feed-doctor"
            title="Why is this feed like this — who is flooding it, and why it ended"
          >
            🩺 Feed Doctor
          </a>
        }
      </div>
      <mb-toolbar class="command-row presentation-row" label="Feed presentation" density="compact">
        <button
          mbToolbarButton
          [pressed]="prefs.feedReader()"
          (click)="prefs.setFeedReader(!prefs.feedReader())"
          title="Reader mode for the feed: reader typography, no pictures"
        >
          📖 Reader
        </button>
        @if (showImages()) {
          <button
            mbToolbarButton
            [pressed]="imagesHidden()"
            (click)="toggleImages()"
            [title]="
              (imagesHidden() ? 'commandBar.textFocus.turnOff' : 'commandBar.textFocus.turnOn')
                | transloco
            "
          >
            Aa {{ 'commandBar.textFocus.label' | transloco }}
          </button>
        }
        @if (showFeedViews()) {
          <button
            mbToolbarButton
            [pressed]="view() === 'media'"
            (click)="setView('media')"
            title="Pictures and videos from the posts currently loaded"
          >
            🖼️ Media</button
          ><button
            mbToolbarButton
            [pressed]="view() === 'articles'"
            (click)="setView('articles')"
            title="Article links from the posts currently loaded"
          >
            🔗 Articles
          </button>
        }
        @if (prefs.feedReader() && showReaderControls()) {
          <span class="font-controls">
            <button
              mbToolbarButton
              (click)="prefs.setReaderFontSize(prefs.readerFontSize() - 1)"
              title="Smaller text"
            >
              A−
            </button>
            <button
              mbToolbarButton
              (click)="prefs.setReaderFontSize(prefs.readerFontSize() + 1)"
              title="Larger text"
            >
              A+
            </button>
          </span>
        }
      </mb-toolbar>
      @if (providerChips() || showFilters()) {
        <div class="command-row filter-row" role="group" aria-label="Feed filters">
          <ng-content />
          @if (providerChips() && hasSourceControls()) {
            <!-- WHAT: networks included in this feed. The label is intentionally a
             code comment rather than visible toolbar furniture. -->
            <mb-toolbar class="provider-group" label="Feed sources" density="compact" embedded>
              @if ((!auth.isAnonymous && !auth.isBlueskyPrimary) || privateFedi()) {
                <button
                  mbToolbarButton
                  [pressed]="prefs.isProviderVisible('mastodon')"
                  (click)="toggleProvider('mastodon')"
                  title="Show or hide Mastodon posts"
                >
                  🦣 Fedi
                </button>
              }
              @if (anonymousFedi()) {
                <button
                  mbToolbarButton
                  [pressed]="prefs.isProviderVisible('anonymous-mastodon')"
                  (click)="toggleProvider('anonymous-mastodon')"
                  title="Show or hide Fediverse posts"
                >
                  🦣 Fedi
                </button>
              }
              @for (p of sourceProviders(); track p.id) {
                <button
                  mbToolbarButton
                  [pressed]="prefs.isProviderVisible(p.id)"
                  (click)="toggleProvider(p.id)"
                  [title]="'Show or hide ' + p.label + ' posts'"
                >
                  {{ p.badge }}
                </button>
              }
            </mb-toolbar>
          }
        </div>
      }
    </div>
  `,
  styles: `
    div.command-row {
      display: flex;
      align-items: center;
      gap: 2px;
      min-width: 0;
      flex-wrap: wrap;
    }
    .filter-row,
    .action-row {
      padding: 3px 8px;
      border-bottom: 1px solid var(--border);
    }
    /* Native destination link remains outside button-only focus navigation. */
    a.command-item {
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: var(--text);
      padding: 3px 4px;
      font-size: 13px;
      white-space: normal;
    }
    a.command-item:hover {
      background: var(--hover);
    }
    .font-controls {
      display: inline-flex;
      gap: 2px;
    }
  `,
})
export class CommandBar {
  protected readonly auth = inject(Auth);
  protected readonly prefs = inject(ClientPrefs);
  protected readonly registry = inject(ProviderRegistry);

  /** WHAT row in its deliberate network order; utility providers are not feed networks. */
  private privateFollows = inject(PrivateFollows);
  private flags = inject(FeatureFlags);
  protected readonly privateFedi = computed(
    () =>
      this.privateFollows
        .current()
        ?.follows()
        .some((follow) => follow.network === 'mastodon') ?? false,
  );

  protected readonly sourceProviders = computed(() => {
    const order = new Map<ProviderId, number>([
      ['bluesky', 0],
      ['rss', 1],
      ['twitter', 2],
    ]);
    const providers: { id: ProviderId; label: string; badge: string }[] = this.registry
      .linked()
      .filter((provider) => order.has(provider.id))
      .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
    if (
      !providers.some((provider) => provider.id === 'bluesky') &&
      this.flags.enabled('connector-bluesky') &&
      this.privateFollows
        .current()
        ?.follows()
        .some((follow) => follow.network === 'bluesky')
    ) {
      providers.unshift({ id: 'bluesky', label: 'Bluesky', badge: '🦋 Bsky' });
    }
    return providers;
  });

  /** Anonymous Mastodon is the Fedi network too; only the storage id differs. */
  protected readonly anonymousFedi = computed(() =>
    this.registry.linked().some((provider) => provider.id === 'anonymous-mastodon'),
  );

  protected readonly hasSourceControls = computed(
    () =>
      (!this.auth.isAnonymous && !this.auth.isBlueskyPrimary) ||
      this.anonymousFedi() ||
      this.privateFedi() ||
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
  readonly showFilters = input(false);
  /** Show the text-focus toggle independently of the Media layout. */
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
