import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ClientPrefs } from '../../client-prefs';
import { ReadingZen } from '../../reading-zen';
import { ThreadLoader } from './thread-loader';
import { ReaderCore } from './reader-core/reader-core';
import { LibraryPanel } from './library-panel/library-panel';
import { ComposeShareRequest, ShareDialog } from '../../share-dialog/share-dialog';
import { Drafts } from '../../drafts';
import { readerChain } from './reader-document';
import { Status } from '../../models';

/**
 * How long Exit waits before deciding that Back did not work.
 *
 * A history navigation cannot be awaited, so leaving is verified rather than
 * assumed. Long enough for the router to settle; short enough that the fallback
 * does not read as the button having hung.
 */
const EXIT_FALLBACK_MS = 120;

// i18n reader.page.loading: Opening…
// i18n reader.page.notFound: We couldn't open that to read.
// i18n reader.page.viewThread: View as a thread
// i18n reader.page.backToRss: Return to RSS

/**
 * The reader page: one document, the whole screen.
 *
 * ## Why this is a page and not a mode
 *
 * Reader mode used to be `?reader=1` on the thread page — a signal flipped
 * inside a component whose actual job is rendering a conversation. That was
 * fine while reading was a toggle. It stops working the moment reading has
 * state of its own (a library, a position, notes, highlights), because all of
 * it would have to live inside `thread.ts` and then be extracted later, with
 * the data already in people's browsers.
 *
 * See `sprint/kindle-0-overview.md`.
 *
 * ## Zen
 *
 * A `full` reading-zen hold: rails, header and footer all go. Taken on init and
 * released in `ngOnDestroy` — never in the Exit handler, because a browser Back
 * button never calls it, and a leaked hold means an app with no navigation.
 *
 * There is no control here to bring the chrome back. The way out is Exit, and
 * that is deliberate: a reader who can toggle the app's furniture back on
 * mid-article is a reader deciding whether to look at the furniture.
 */
@Component({
  selector: 'app-read-page',
  imports: [RouterLink, TranslocoPipe, ReaderCore, LibraryPanel, ShareDialog],
  templateUrl: './read-page.html',
  styleUrl: './read-page.css',
  providers: [ThreadLoader],
})
export class ReadPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private drafts = inject(Drafts).forCurrentAccount();
  private readingZen = inject(ReadingZen);

  protected readonly prefs = inject(ClientPrefs);
  protected readonly loader = inject(ThreadLoader);

  private core = viewChild(ReaderCore);

  /** Releases the hold on the app's chrome. Non-null for this page's lifetime. */
  private releaseZen: (() => void) | null = null;

  /** The id currently being read, for the "view as thread" link. */
  protected readonly currentId = signal('');

  /**
   * The document that is actually on screen.
   *
   * Kept separate from the route being loaded so choosing another library row
   * does not tear down the whole reading surface and the library while its
   * request is in flight. The old page remains readable until the replacement
   * is ready, which is the SPA transition the library promises.
   */
  private readonly displayedThread = signal<Status[]>([]);
  protected readonly displayedId = signal('');

  /** The author's own chain: the displayed document, not the pending route. */
  protected readonly chain = computed(() =>
    readerChain(this.displayedThread(), this.displayedId()),
  );

  /** Atomically replace the displayed document once its load has settled. */
  private readonly showLoadedDocument = effect(() => {
    if (this.loader.loading()) {
      return;
    }
    this.displayedThread.set(this.loader.thread());
    this.displayedId.set(this.currentId());
  });

  /**
   * Whether the library sheet is showing.
   *
   * Off by default, per the brief, and remembered — someone who reads with the
   * library open is telling us how they like to read, not making a one-off
   * request. The preference lives in `ClientPrefs` rather than the library
   * store: it is view state, and the store is shaped for a later sync.
   */
  protected readonly libraryOpen = this.prefs.readerLibraryOpen;

  /** The share dialog, opened by the reader's selection popover. */
  protected readonly showShare = signal(false);
  protected readonly shareQuote = signal('');

  protected shareSelection(quote: string): void {
    this.shareQuote.set(quote);
    this.showShare.set(true);
  }

  /**
   * Park a prefilled draft and send the reader to the composer.
   *
   * The same handoff the RSS pane makes, for the same reason: there is no
   * composer on this page, and dropping the request would leave someone with a
   * closed dialog and nothing to show for the destination they picked.
   */
  protected composeShare(request: ComposeShareRequest): void {
    this.drafts.handoff({
      segments: [request.text],
      spoilerText: '',
      sensitive: false,
      visibility: '',
      poll: null,
      target: request.target === 'both' ? 'fedi' : request.target,
    });
    this.showShare.set(false);
    void this.router.navigate(['/write']);
  }

  protected toggleLibrary(): void {
    this.prefs.setReaderLibraryOpen(!this.libraryOpen());
  }

  ngOnInit(): void {
    this.releaseZen = this.readingZen.hold('full');
    // A plain listener rather than `@HostListener`: the reader's keys are
    // document-wide (the focus is usually in the article, not on the host), and
    // registering here keeps the add and the remove next to each other.
    document.addEventListener('keydown', this.onKeydown);

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('id') ?? '';
      if (!id || id === this.currentId()) {
        return;
      }
      this.currentId.set(id);
      this.loader.load(id);
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onKeydown);
    this.releaseZen?.();
    this.releaseZen = null;
    this.loader.destroy();
  }

  /**
   * Leave the reader.
   *
   * ## Why this is Back, and why that is not enough on its own
   *
   * Back, because the reader is reached from a feed, a thread, a search or the
   * RSS pane, and sending everyone to the thread view would strand four of
   * those five somewhere they did not come from.
   *
   * But Back only means "leave" while the reader occupies **one** history
   * entry. It did not: opening a document from the library pushed a new
   * `/read/:id`, so after reading three things Exit walked back through them one
   * at a time and never left — reported by the operator as *"I click exit... it
   * doesn't exit reader, it goes to the previous thread in reader mode."* The
   * library's links now use `replaceUrl`, which is the real fix; moving within
   * the reader is not travelling somewhere new.
   *
   * This still guards the case, because history is not ours to trust: a browser
   * restore, a redirect, or a link opened in a new tab can all leave the entry
   * we would land on pointing back at the reader. If Back does not actually get
   * us out, go somewhere that certainly does.
   */
  protected exit(): void {
    if (history.length <= 1) {
      this.leaveToThread();
      return;
    }
    const leaving = this.router.url;
    history.back();
    // A history navigation is asynchronous and cannot be awaited. If we are
    // still on a reader URL shortly afterwards, Back did not take us out of the
    // reader and the fallback is the honest answer. The timeout is long enough
    // for the router to settle and short enough not to be seen as a hang.
    setTimeout(() => {
      if (this.router.url.startsWith('/read/') && this.router.url === leaving) {
        this.leaveToThread();
      }
    }, EXIT_FALLBACK_MS);
  }

  /** The one destination that is always right: this document, as a thread. */
  private leaveToThread(): void {
    void this.router.navigate(['/statuses', this.currentId()], {
      queryParams: { reader: '0' },
    });
  }

  /**
   * Page-turning keys.
   *
   * On this page rather than in `hotkeys.ts`, the same way `StatusCard`'s
   * per-status keys are: these are bindings of a surface, not of the app. They
   * stop propagation so the global map's `j`/`k`/`/` never fire underneath.
   *
   * Ignored while focus is in a form control, or when a modifier is held — a
   * reader using ⌘← to go back should go back.
   */
  onKeydown = (event: KeyboardEvent): void => {
    // Before the modifier guard, because this binding *is* a modifier one.
    //
    // Taking Ctrl/Cmd+F is only defensible where the browser's own find would
    // mislead: in page-flip mode it searches the one page on screen and reports
    // "not found" for a phrase three pages back. `canSearch()` is false on a
    // document that did not paginate, so on those the browser keeps its key —
    // there, its find is the better tool and ours would be a worse copy.
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'f') {
      const core = this.core();
      if (core?.canSearch()) {
        event.preventDefault();
        event.stopPropagation();
        core.openSearch();
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
    ) {
      return;
    }

    const core = this.core();
    const paging = this.prefs.readerPageFlip();

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.exit();
        return;
      case 'ArrowRight':
      case 'PageDown':
        if (!paging || !core) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        core.nextPage();
        return;
      case 'ArrowLeft':
      case 'PageUp':
        if (!paging || !core) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        core.prevPage();
        return;
      case ' ':
        if (!paging || !core) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          core.prevPage();
        } else {
          core.nextPage();
        }
        return;
      case 'Home':
      case 'End':
        if (!paging || !core) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        core.goToPage(event.key === 'Home' ? 1 : Number.MAX_SAFE_INTEGER);
        return;
      default:
        return;
    }
  };
}
