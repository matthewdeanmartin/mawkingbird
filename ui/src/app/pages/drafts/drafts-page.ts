import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Compose } from '../../compose/compose';
import { ConfirmDialog } from '../../confirm-dialog/confirm-dialog';
import { Drafts } from '../../drafts';
import { FeatureFlags } from '../../feature-flags';
import { HumanTimePipe } from '../../human-time.pipe';
import { ScheduledStatus } from '../../models';
import { PasteHistory } from '../../providers/paste/paste-history';
import { ClientPrefs } from '../../client-prefs';
import { PasteExpiry } from '../../providers/paste/paste-provider';
import { PasteProviderRegistry } from '../../providers/paste/paste-provider-registry';
import { DraftItem, DraftKind, toSnapshot } from './draft-items';
import { DraftSources } from './draft-sources';
import { Terminology } from '../../terminology';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

/** Filter chips above the merged list; 'all' is the default. */
type DraftFilter = 'all' | DraftKind;

interface FilterChip {
  id: DraftFilter;
  labelKey: string;
}

/** What a pending removal will actually destroy — the confirm copy depends on it. */
interface PendingRemoval {
  item: DraftItem;
  title: string;
  message: string;
  confirmLabel: string;
}

/** An in-flight "→ Paste": the source plus the provider metadata being chosen. */
interface PendingPaste {
  item: DraftItem;
  providerId: string;
  language: string;
  expiry: string;
}

/** An in-flight "→ Schedule": the source plus the datetime-local park value. */
interface PendingPark {
  item: DraftItem;
  at: string;
}

/**
 * An in-flight "unpark": a parked post on its way back to being an editable
 * local draft.
 *
 * Unlike every other conversion on this page, this one *does* remove the
 * original — that is the whole point, and why it asks first. A parked post is a
 * draft the server is holding; bringing it back to the browser has to cancel
 * the server's copy or the same writing exists twice, one of which publishes
 * itself on a date the user has stopped thinking about.
 */
interface PendingUnpark {
  item: DraftItem;
}

/**
 * Where the park dialog starts: far enough out that {@link isParkedSchedule}
 * files it under drafts rather than pending posts. Editable in the dialog — and
 * if the server refuses a date this far away, that surfaces as an ordinary
 * error rather than something we try to predict or clamp.
 */
function defaultParkDate(): string {
  const at = new Date();
  at.setFullYear(at.getFullYear() + PARK_YEARS_OUT);
  at.setSeconds(0, 0);
  // `datetime-local` wants a local-time string with no zone suffix.
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}`
  );
}

const PARK_YEARS_OUT = 99;

/**
 * Explain a refused park using the server's own words where it gave any.
 *
 * A far-future `scheduled_at` may simply be rejected by some instances, and
 * that is fine — it is ordinary error handling, not a case worth predicting.
 * What matters is that the message says a nearer date might work, and that the
 * user knows their draft survived.
 */
function parkFailure(error: unknown): string {
  const detail =
    error instanceof HttpErrorResponse && typeof error.error?.error === 'string'
      ? ` (${error.error.error})`
      : '';
  return detail;
}

/** How to name a kind in a sentence, for the "source is still here" reassurance. */
function kindNoun(kind: DraftKind): string {
  switch (kind) {
    case 'local':
      return 'pages.drafts.kind.originalDraft';
    case 'scheduled':
      return 'pages.drafts.kind.parkedPost';
    case 'self':
      return 'pages.drafts.kind.privateNote';
    case 'paste':
      return 'pages.drafts.kind.paste';
  }
}

/**
 * The drafts list: every unpublished post the user has, from all four
 * mechanisms Mockingbird can park one in, merged into a single time-sorted
 * list — see {@link DraftKind} for what each one actually is and costs.
 *
 * Genuinely pending scheduled posts (near enough to fire) are deliberately kept
 * out of that list and shown separately below it. A post that publishes tomorrow
 * is not a draft, and displaying it as one invites exactly the wrong assumption.
 */
// i18n pages.drafts.title: Drafts
// i18n pages.drafts.openWrite: Open in Write →
// i18n pages.drafts.intro: Everything you've written but not published — wherever you parked it. Mastodon has no drafts API, so each of these lives somewhere different.
// i18n pages.drafts.write.close: Close
// i18n pages.drafts.write.button: ✍ Write
// i18n pages.drafts.filter.ariaLabel: Filter drafts by kind
// i18n pages.drafts.chip.all: All
// i18n pages.drafts.chip.local: 💾 Local
// i18n pages.drafts.chip.parked: ⏳ Parked
// i18n pages.drafts.chip.self: 🔒 Self
// i18n pages.drafts.chip.paste: 📋 Paste
// i18n pages.drafts.loading: Loading drafts…
// i18n pages.drafts.empty.intro: Nothing in progress. A draft can live in four places:
// i18n pages.drafts.empty.local: saved in this browser. Private and instant, but stays here.
// i18n pages.drafts.empty.parked: a scheduled post dated far enough out that it never fires. Kept by the server, so it follows you.
// i18n pages.drafts.empty.self: a post to nobody but you. Follows you too, but your instance admin can read it.
// i18n pages.drafts.empty.paste: text parked at a paste service. Reachable anywhere via its link, and not private.
// i18n pages.drafts.empty.tip: While composing, hit 💾 to save one — anything half-written is auto-kept for you anyway.
// i18n pages.drafts.empty.noneOfKind: No drafts of that kind.
// i18n pages.drafts.meta.local: 💾 local
// i18n pages.drafts.meta.localTitle: Saved in this browser only
// i18n pages.drafts.meta.parked: ⏳ parked
// i18n pages.drafts.meta.scheduledTitle: Parked on the server as a far-future scheduled {{post}}
// i18n pages.drafts.meta.until: until {{date}}
// i18n pages.drafts.meta.selfTitle: A private {{post}} to yourself, held on the server
// i18n pages.drafts.meta.pasteTitle: Parked at an external paste service
// i18n pages.drafts.edit.blocked: Enable Pastebin in Settings → Feature flags to continue
// i18n pages.drafts.edit.title: Open in the composer with a live Post button
// i18n pages.drafts.edit.continue: Continue
// i18n pages.drafts.edit.forPost: Edit for post
// i18n pages.drafts.convert.ariaLabel: Convert this draft
// i18n pages.drafts.convert.local: 💾 Copy to local drafts
// i18n pages.drafts.convert.paste: 📋 Copy to a paste…
// i18n pages.drafts.convert.schedule: ⏳ Park as a schedule…
// i18n pages.drafts.convert.unpark: ↩ Unpark to a draft…
// i18n pages.drafts.convert.note: Copies never remove the original. Unparking does — it asks first.
// i18n pages.drafts.remove.fromList: Remove from this list
// i18n pages.drafts.remove.draft: Remove draft
// i18n pages.drafts.scheduled.title: Scheduled
// i18n pages.drafts.scheduled.note: These are not drafts: they publish automatically at their set time, even with this browser closed.
// i18n pages.drafts.scheduled.cancelTitle: Cancel scheduled {{post}}
// i18n pages.drafts.cancel: Cancel
// i18n pages.drafts.scheduled.cancelDialog.title: Cancel this scheduled {{post}}?
// i18n pages.drafts.scheduled.cancelDialog.message: It will be deleted from the server and never published.
// i18n pages.drafts.scheduled.cancelDialog.confirm: Cancel post
// i18n pages.drafts.pasteDialog.title: Copy to a paste service
// i18n pages.drafts.pasteDialog.description: Publishes a copy to an external service. Your {{kind}} stays exactly where it is.
// i18n pages.drafts.pasteDialog.service: Service
// i18n pages.drafts.pasteDialog.language: Language
// i18n pages.drafts.pasteDialog.expiry: Expiry
// i18n pages.drafts.pasteDialog.immutable: ⚠ {{provider}} links can't be edited or deleted once created.
// i18n pages.drafts.pasteDialog.pasting: Pasting…
// i18n pages.drafts.pasteDialog.create: Create paste
// i18n pages.drafts.parkDialog.title: Park as a schedule
// i18n pages.drafts.parkDialog.description: The server holds it until this date. Your {{kind}} stays exactly where it is.
// i18n pages.drafts.parkDialog.publishAt: Publish at
// i18n pages.drafts.parkDialog.hint: Anything more than 10 years out lists here as a draft rather than a scheduled post. Some servers refuse very distant dates — if this one does, pick a nearer one.
// i18n pages.drafts.parkDialog.parking: Parking…
// i18n pages.drafts.parkDialog.park: Park it
// i18n pages.drafts.unparkDialog.title: Unpark to a draft?
// i18n pages.drafts.unparkDialog.description: It comes back as a local draft in this browser, and the server stops holding it — so it will not publish itself on its parked date.
// i18n pages.drafts.unparkDialog.note: This is the one conversion here that removes the original. Everything else copies.
// i18n pages.drafts.unparkDialog.unparking: Unparking…
// i18n pages.drafts.unparkDialog.unpark: Unpark it
// i18n pages.drafts.kind.originalDraft: original draft
// i18n pages.drafts.kind.parkedPost: parked post
// i18n pages.drafts.kind.privateNote: private note
// i18n pages.drafts.kind.paste: paste
// i18n pages.drafts.notice.copiedLocal: Copied to local drafts. The {{kind}} is still here too.
// i18n pages.drafts.notice.unparked: Unparked. It is a local draft now, and the server will not publish it.
// i18n pages.drafts.notice.pasted: Pasted to {{provider}}. The {{kind}} is still here too.
// i18n pages.drafts.notice.parked: Parked. The {{kind}} is still here too.
// i18n pages.drafts.errors.unparkCancel: Saved as a local draft, but the parked post could not be cancelled on the server — it is still scheduled. Try removing it from the list below.
// i18n pages.drafts.errors.emptyPaste: There is nothing to paste — this draft has no text.
// i18n pages.drafts.errors.pastePersist: {{provider}} paste created ({{url}}). {{error}}
// i18n pages.drafts.errors.pasteCreate: Couldn't create the {{provider}} paste — nothing was changed, your {{kind}} is untouched.
// i18n pages.drafts.errors.invalidDate: That date could not be read. Pick a publish time.
// i18n pages.drafts.errors.emptySchedule: There is nothing to schedule — this draft has no text.
// i18n pages.drafts.errors.parkFailure: That publish time was refused{{detail}}. Try a nearer date — nothing was changed and your draft is untouched.
// i18n pages.drafts.errors.removeScheduled: That parked post couldn't be cancelled on the server.
// i18n pages.drafts.errors.removeSelf: That private note couldn't be deleted.
// i18n pages.drafts.errors.cancelScheduled: That scheduled post couldn't be cancelled.
// i18n pages.drafts.preview.mediaPost: (media post)
// i18n pages.drafts.preview.emptyPost: (empty post)
// i18n pages.drafts.remove.local.title: Delete this draft?
// i18n pages.drafts.remove.local.message: It only exists in this browser — there's no getting it back.
// i18n pages.drafts.remove.delete: Delete
// i18n pages.drafts.remove.parked.title: Cancel this parked post?
// i18n pages.drafts.remove.parked.message: It will be deleted from the server and never published.
// i18n pages.drafts.remove.cancelPost: Cancel post
// i18n pages.drafts.remove.self.title: Delete this private note?
// i18n pages.drafts.remove.self.message: It is a real post on the server, visible only to you. Deleting it removes it for good.
// i18n pages.drafts.remove.deletePost: Delete post
// i18n pages.drafts.remove.paste.title: Forget this paste?
// i18n pages.drafts.remove.paste.message: This only removes it from your list here. The paste itself stays at its provider — delete it there from the Pastes page, which has its edit key.
// i18n pages.drafts.remove.forget: Forget
@Component({
  selector: 'app-drafts-page',
  imports: [Compose, ConfirmDialog, FormsModule, HumanTimePipe, RouterLink, TranslocoPipe],
  templateUrl: './drafts-page.html',
  styleUrl: './drafts-page.css',
})
export class DraftsPage implements OnInit {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;
  private readonly transloco = inject(TranslocoService);

  protected sources = inject(DraftSources);
  private api = inject(Api);
  private router = inject(Router);
  private drafts = inject(Drafts).forCurrentAccount();
  private pastes = inject(PasteHistory);
  protected auth = inject(Auth);
  protected featureFlags = inject(FeatureFlags);
  protected prefs = inject(ClientPrefs);
  protected pasteProviders = inject(PasteProviderRegistry);
  private route = inject(ActivatedRoute);

  protected filter = signal<DraftFilter>('all');
  protected pendingRemoval = signal<PendingRemoval | null>(null);
  protected pendingCancel = signal<ScheduledStatus | null>(null);
  protected pendingPaste = signal<PendingPaste | null>(null);
  protected pendingPark = signal<PendingPark | null>(null);
  protected pendingUnpark = signal<PendingUnpark | null>(null);
  /** Set when a removal fails server-side; the row stays put. */
  protected removeError = signal<string | null>(null);
  /** Set when a conversion fails. The source is always still there. */
  protected actionError = signal<string | null>(null);
  /** Transient "that worked, and your original survived" confirmation. */
  protected notice = signal<string | null>(null);
  /** True while a conversion is in flight, to keep the dialog buttons honest. */
  protected busy = signal(false);
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly chips: FilterChip[] = [
    { id: 'all', labelKey: 'pages.drafts.chip.all' },
    { id: 'local', labelKey: 'pages.drafts.chip.local' },
    { id: 'scheduled', labelKey: 'pages.drafts.chip.parked' },
    { id: 'self', labelKey: 'pages.drafts.chip.self' },
    { id: 'paste', labelKey: 'pages.drafts.chip.paste' },
  ];

  protected visible = computed(() => {
    const filter = this.filter();
    return filter === 'all'
      ? this.sources.items()
      : this.sources.items().filter((item) => item.kind === filter);
  });

  /** Whether the save-only editor at the top of the page is open. */
  protected writing = signal(false);

  ngOnInit(): void {
    this.sources.load();
    // Home's Write button lands here with ?write=1 and expects a ready box.
    if (this.route.snapshot.queryParamMap.get('write')) {
      this.writing.set(true);
    }
  }

  protected openWriter(): void {
    this.writing.set(true);
  }

  /** Closing after a save drops the new draft into the list below without a reload. */
  protected closeWriter(): void {
    this.writing.set(false);
  }

  /** Chip counts; 'all' shows the total. A zero chip stays visible but disabled. */
  protected count(id: DraftFilter): number {
    return id === 'all' ? this.sources.items().length : this.sources.counts()[id];
  }

  protected select(id: DraftFilter): void {
    this.filter.set(id);
  }

  /**
   * Load a draft into the home composer with a live Post button.
   *
   * A local draft keeps its existing contract: `?draft=<id>` *consumes* it into
   * the composer, which is what "Continue" has always meant. Every other kind
   * hands over a copy and leaves the original exactly where it is — converting
   * must never be how you lose the thing you converted.
   */
  protected editForPost(item: DraftItem): void {
    if (item.source.kind === 'local') {
      void this.router.navigate(['/home'], { queryParams: { draft: item.id } });
      return;
    }
    this.drafts.handoff(
      toSnapshot(item.source, this.prefs.defaultVisibility()),
      // Only a self draft leaves a duplicate behind once published, so only it
      // asks the composer to offer cleanup afterwards.
      item.source.kind === 'self' ? item.id : undefined,
    );
    void this.router.navigate(['/home']);
  }

  /** A local paste-target draft can't be continued with the pastebin flag off. */
  protected blockedByFlag(item: DraftItem): boolean {
    return (
      ((item.source.kind === 'local' && item.source.draft.target === 'paste') ||
        item.kind === 'paste') &&
      !this.featureFlags.enabled('pastebin')
    );
  }

  // ------------------------------------------------------------- conversions
  //
  // Every conversion reads its source through `toSnapshot` and writes a new,
  // independent artifact. The source is never touched — not on success, not on
  // failure. That is the rule for the whole matrix, and the reason none of
  // these methods have a cleanup branch.

  /** Copy any kind into a browser-local draft. */
  protected convertToLocal(item: DraftItem): void {
    this.actionError.set(null);
    this.notice.set(null);
    if (!this.drafts.save(toSnapshot(item.source, this.prefs.defaultVisibility())).durable) {
      this.actionError.set(this.transloco.translate('drafts.saveFailed'));
      return;
    }
    this.flash(
      this.transloco.translate('pages.drafts.notice.copiedLocal', {
        kind: this.kindLabel(item.kind),
      }),
    );
  }

  /** Open the provider picker to publish a copy to a paste service. */
  protected askConvertToPaste(item: DraftItem): void {
    this.actionError.set(null);
    const provider = this.pasteProviders.default;
    this.pendingPaste.set({
      item,
      providerId: provider.id,
      language: provider.languages[0]?.value ?? 'plaintext',
      expiry: provider.expiries[0]?.value ?? '1w',
    });
  }

  /** Open the park dialog to hold a copy as a far-future scheduled post. */
  protected askConvertToSchedule(item: DraftItem): void {
    this.actionError.set(null);
    this.pendingPark.set({ item, at: defaultParkDate() });
  }

  /** Ask before bringing a parked post back as an editable local draft. */
  protected askUnpark(item: DraftItem): void {
    this.actionError.set(null);
    this.pendingUnpark.set({ item });
  }

  protected cancelUnpark(): void {
    this.pendingUnpark.set(null);
  }

  /**
   * Bring a parked post back to the browser as an ordinary draft.
   *
   * Save first, cancel second, and only forget the row once the server has
   * agreed. Ordered that way on purpose: if the cancel fails the user still has
   * their writing as a local draft and sees an error, which is recoverable. The
   * other order risks cancelling the server's copy and then failing to save,
   * which loses the post outright.
   *
   * The duplicate that exists between those two steps is deliberate and the
   * safe side of the trade.
   */
  protected confirmUnpark(): void {
    const pending = this.pendingUnpark();
    if (!pending) {
      return;
    }
    const { item } = pending;
    this.busy.set(true);
    this.actionError.set(null);
    this.notice.set(null);
    if (!this.drafts.save(toSnapshot(item.source, this.prefs.defaultVisibility())).durable) {
      this.busy.set(false);
      this.actionError.set(this.transloco.translate('drafts.saveFailed'));
      return;
    }
    this.api.cancelScheduledStatus(item.id).subscribe({
      next: () => {
        this.sources.forgetScheduled(item.id);
        this.busy.set(false);
        this.pendingUnpark.set(null);
        this.flash(this.transloco.translate('pages.drafts.notice.unparked'));
      },
      error: () => {
        this.busy.set(false);
        this.pendingUnpark.set(null);
        // The draft is already saved, so say so rather than implying the
        // writing was lost along with the failed cancellation.
        this.actionError.set(this.transloco.translate('pages.drafts.errors.unparkCancel'));
      },
    });
  }

  /** How to refer to a kind in dialog copy ("your private note stays where it is"). */
  protected kindLabel(kind: DraftKind): string {
    return this.transloco.translate(kindNoun(kind));
  }

  /** Translate a badge key while preserving provider/expiry metadata. */
  protected badgeText(badge: string): string {
    const [key, rawCount] = badge.split('|', 2);
    if (key.startsWith('pages.drafts.')) {
      return this.transloco.translate(key, rawCount === undefined ? {} : { count: rawCount });
    }
    return badge;
  }

  protected previewText(item: DraftItem): string {
    return item.preview.startsWith('pages.drafts.preview.')
      ? this.transloco.translate(item.preview)
      : item.preview;
  }

  /** Selected paste provider's live metadata, for the picker's dependent fields. */
  protected pasteProvider(pending: PendingPaste) {
    return this.pasteProviders.get(pending.providerId) ?? this.pasteProviders.default;
  }

  /** Changing provider re-checks language/expiry, which are provider-specific. */
  protected onPasteProviderPick(providerId: string): void {
    const pending = this.pendingPaste();
    if (!pending) {
      return;
    }
    const provider = this.pasteProviders.get(providerId) ?? this.pasteProviders.default;
    this.pendingPaste.set({
      item: pending.item,
      providerId: provider.id,
      language: provider.languages.some((l) => l.value === pending.language)
        ? pending.language
        : (provider.languages[0]?.value ?? 'plaintext'),
      expiry: provider.expiries.some((e) => e.value === pending.expiry)
        ? pending.expiry
        : (provider.expiries[0]?.value ?? '1w'),
    });
  }

  protected setPasteField(field: 'language' | 'expiry', value: string): void {
    const pending = this.pendingPaste();
    if (pending) {
      this.pendingPaste.set({ ...pending, [field]: value });
    }
  }

  protected setParkAt(at: string): void {
    const pending = this.pendingPark();
    if (pending) {
      this.pendingPark.set({ ...pending, at });
    }
  }

  /** Publish a copy of the draft to the chosen paste service. */
  protected confirmConvertToPaste(): void {
    const pending = this.pendingPaste();
    if (!pending || this.busy()) {
      return;
    }
    const provider = this.pasteProvider(pending);
    const snapshot = toSnapshot(pending.item.source, this.prefs.defaultVisibility());
    const content = snapshot.segments.filter((s) => s.trim()).join('\n\n');
    if (!content.trim()) {
      this.actionError.set(this.transloco.translate('pages.drafts.errors.emptyPaste'));
      return;
    }
    this.busy.set(true);
    this.actionError.set(null);
    provider
      .create({
        title: snapshot.spoilerText,
        content,
        language: pending.language,
        // Burn-after-reading can only be unlisted; otherwise take the provider's
        // widest option, matching what the composer's paste path does.
        expiry: pending.expiry as PasteExpiry,
        visibility:
          pending.expiry === 'burn' ? 'unlisted' : (provider.visibilities[0] ?? 'unlisted'),
      })
      .subscribe({
        next: (created) => {
          this.pastes.add(
            provider.id,
            provider.label,
            {
              title: snapshot.spoilerText,
              content,
              language: pending.language,
              expiry: pending.expiry as PasteExpiry,
              visibility:
                pending.expiry === 'burn' ? 'unlisted' : (provider.visibilities[0] ?? 'unlisted'),
            },
            created,
          );
          this.busy.set(false);
          this.pendingPaste.set(null);
          // A paste link that didn't make it to storage is unrecoverable, so
          // say so instead of showing a cheerful success.
          const persistError = this.pastes.persistError();
          if (persistError) {
            this.actionError.set(
              this.transloco.translate('pages.drafts.errors.pastePersist', {
                provider: provider.label,
                url: created.url,
                error: persistError,
              }),
            );
            return;
          }
          this.flash(
            this.transloco.translate('pages.drafts.notice.pasted', {
              provider: provider.label,
              kind: this.kindLabel(pending.item.kind),
            }),
          );
        },
        error: () => {
          this.busy.set(false);
          this.actionError.set(
            this.transloco.translate('pages.drafts.errors.pasteCreate', {
              provider: provider.label,
              kind: this.kindLabel(pending.item.kind),
            }),
          );
        },
      });
  }

  /**
   * Park a copy as a far-future scheduled post.
   *
   * A server that refuses the date is ordinary error handling: we don't probe
   * for a ceiling or clamp speculatively. The dialog stays open with the date
   * still filled in so the user can just pick a nearer one.
   */
  protected confirmConvertToSchedule(): void {
    const pending = this.pendingPark();
    if (!pending || this.busy()) {
      return;
    }
    const at = new Date(pending.at);
    if (Number.isNaN(at.getTime())) {
      this.actionError.set(this.transloco.translate('pages.drafts.errors.invalidDate'));
      return;
    }
    const snapshot = toSnapshot(pending.item.source, this.prefs.defaultVisibility());
    const text = snapshot.segments.filter((s) => s.trim()).join('\n\n');
    if (!text.trim()) {
      this.actionError.set(this.transloco.translate('pages.drafts.errors.emptySchedule'));
      return;
    }
    this.busy.set(true);
    this.actionError.set(null);
    this.api
      .postStatus(text, {
        visibility: snapshot.visibility,
        spoilerText: snapshot.spoilerText || undefined,
        sensitive: snapshot.sensitive,
        scheduledAt: at.toISOString(),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.pendingPark.set(null);
          this.sources.load();
          this.flash(
            this.transloco.translate('pages.drafts.notice.parked', {
              kind: this.kindLabel(pending.item.kind),
            }),
          );
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.actionError.set(
            this.transloco.translate('pages.drafts.errors.parkFailure', {
              detail: parkFailure(err),
            }),
          );
        },
      });
  }

  private flash(message: string): void {
    this.notice.set(message);
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
    }
    this.noticeTimer = setTimeout(() => this.notice.set(null), 6000);
  }

  /**
   * Ask before removing, naming what is actually destroyed. The four kinds are
   * destroyed in four genuinely different places, and "Delete" meaning "clears
   * your browser" in one row and "deletes a server post" in the next is exactly
   * the kind of thing that loses someone's writing.
   */
  protected askRemove(item: DraftItem): void {
    this.removeError.set(null);
    this.pendingRemoval.set({ item, ...removalCopy(item, (key) => this.transloco.translate(key)) });
  }

  protected confirmRemove(): void {
    const pending = this.pendingRemoval();
    this.pendingRemoval.set(null);
    if (!pending) {
      return;
    }
    const { item } = pending;
    switch (item.source.kind) {
      case 'local':
        if (!this.drafts.remove(item.id).durable) {
          this.removeError.set(this.transloco.translate('drafts.removeFailed'));
        }
        return;
      case 'paste':
        // Only forgets the local record — the paste itself stays at its
        // provider. Deleting it there lives on /pastes, which owns the edit
        // key and the provider's immutability rules.
        this.pastes.remove(item.id);
        return;
      case 'scheduled':
        this.api.cancelScheduledStatus(item.id).subscribe({
          next: () => this.sources.forgetScheduled(item.id),
          error: () =>
            this.removeError.set(this.transloco.translate('pages.drafts.errors.removeScheduled')),
        });
        return;
      case 'self':
        this.api.deleteStatus(item.id).subscribe({
          next: () => this.sources.forgetSelf(item.id),
          error: () =>
            this.removeError.set(this.transloco.translate('pages.drafts.errors.removeSelf')),
        });
        return;
    }
  }

  protected confirmCancel(): void {
    const sched = this.pendingCancel();
    this.pendingCancel.set(null);
    if (!sched) {
      return;
    }
    this.api.cancelScheduledStatus(sched.id).subscribe({
      next: () => this.sources.forgetScheduled(sched.id),
      error: () =>
        this.removeError.set(this.transloco.translate('pages.drafts.errors.cancelScheduled')),
    });
  }

  protected scheduledPreview(s: ScheduledStatus): string {
    const text = s.params.text ?? '';
    if (text.trim()) {
      return text.length > 140 ? `${text.slice(0, 140)}…` : text;
    }
    return s.media_attachments.length
      ? this.transloco.translate('pages.drafts.preview.mediaPost')
      : this.transloco.translate('pages.drafts.preview.emptyPost');
  }

  protected scheduledWhen(s: ScheduledStatus): string {
    return new Date(s.scheduled_at).toLocaleString();
  }

  /** The far-future date a parked schedule carries, shown instead of "in 99 years". */
  protected parkedWhen(item: DraftItem): string {
    return item.source.kind === 'scheduled'
      ? new Date(item.source.scheduled.scheduled_at).toLocaleDateString()
      : '';
  }
}

/** Confirm-dialog copy naming the real consequence, per kind. */
function removalCopy(
  item: DraftItem,
  translate: (key: string) => string,
): Omit<PendingRemoval, 'item'> {
  switch (item.kind) {
    case 'local':
      return {
        title: translate('pages.drafts.remove.local.title'),
        message: translate('pages.drafts.remove.local.message'),
        confirmLabel: translate('pages.drafts.remove.delete'),
      };
    case 'scheduled':
      return {
        title: translate('pages.drafts.remove.parked.title'),
        message: translate('pages.drafts.remove.parked.message'),
        confirmLabel: translate('pages.drafts.remove.cancelPost'),
      };
    case 'self':
      return {
        title: translate('pages.drafts.remove.self.title'),
        message: translate('pages.drafts.remove.self.message'),
        confirmLabel: translate('pages.drafts.remove.deletePost'),
      };
    case 'paste':
      return {
        title: translate('pages.drafts.remove.paste.title'),
        message: translate('pages.drafts.remove.paste.message'),
        confirmLabel: translate('pages.drafts.remove.forget'),
      };
  }
}
