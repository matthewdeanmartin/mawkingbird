import {
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Status } from '../../models';
import { Streaming, StreamEvent } from '../../streaming';
import { StatusCard } from '../../status-card/status-card';
import { StatusVisibility } from '../../status-visibility';
import { normalizeHashtag } from '../../hashtag';
import { canonicalStatusKey } from '../../providers/anonymous/anonymous-feed-corpus';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import { AnonymousAccount } from '../../providers/anonymous/anonymous-account';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbHelp } from '../../design-system/help/help';

// i18n watch.party.add: Add hashtag to party
// i18n watch.party.tags: Party hashtags
// i18n watch.party.help: About party hashtags
// i18n watch.party.temporary: These tags mix public posts with the video's comments for this visit only. Nothing is followed or saved. Updates come from your server's hashtag feeds; refresh retries unavailable feeds.
// i18n watch.party.placeholder: #Anime2000 #AIEpisode2000
// i18n watch.party.remove: Remove #{{tag}} from party
// i18n watch.party.invalid: Use valid hashtags, with up to eight different tags per party.
// i18n watch.party.failed: Couldn't load: {{tags}}. Refresh to try again.
// i18n watch.party.refresh: Refresh party
// i18n watch.party.more: Load more party posts
// i18n watch.party.empty: No comments or party posts loaded yet.
// i18n watch.party.loading: Loading party posts…
@Component({
  selector: 'app-party-conversation',
  imports: [FormsModule, TranslocoPipe, StatusCard, MbButton, MbField, MbControl, MbHelp],
  template: `
    <form (ngSubmit)="addInput()">
      <mb-field [label]="'watch.party.tags' | transloco">
        <input
          mbControl
          name="tags"
          [ngModel]="draft()"
          (ngModelChange)="draft.set($event)"
          [placeholder]="'watch.party.placeholder' | transloco"
        />
      </mb-field>
      <button mbButton type="submit" size="small" [disabled]="!draft().trim()">
        {{ 'watch.party.add' | transloco }}
      </button>
      <mb-help [label]="'watch.party.help' | transloco"
        ><p>{{ 'watch.party.temporary' | transloco }}</p></mb-help
      >
    </form>
    @if (validation()) {
      <p role="alert">{{ 'watch.party.invalid' | transloco }}</p>
    }
    <div class="party-tags">
      @for (tag of tags(); track tag) {
        <button
          mbButton
          type="button"
          variant="outline"
          size="small"
          [attr.aria-label]="'watch.party.remove' | transloco: { tag }"
          (click)="removeTag(tag)"
        >
          #{{ tag }} ×
        </button>
      }
    </div>
    @if (tags().length) {
      <button mbButton type="button" variant="outline" size="small" (click)="refresh()">
        {{ 'watch.party.refresh' | transloco }}
      </button>
    }
    @if (failed().length) {
      <p role="alert">{{ 'watch.party.failed' | transloco: { tags: failed().join(', ') } }}</p>
    }
    @if (busy().length) {
      <p role="status">{{ 'watch.party.loading' | transloco }}</p>
    }
    @for (item of mixed(); track item.key) {
      <app-status-card
        [status]="item.status"
        [filterContext]="item.context"
        [partyTagsEnabled]="true"
        (partyTagAdded)="addTag($event)"
        (changed)="changed.emit($event); update($event)"
        (deleted)="deleted.emit($event); erase($event)"
        (replied)="replied.emit($event)"
      />
    } @empty {
      <p class="muted">{{ 'watch.party.empty' | transloco }}</p>
    }
    @if (hasMore()) {
      <button
        mbButton
        type="button"
        variant="outline"
        [disabled]="!!busy().length"
        (click)="more()"
      >
        {{ 'watch.party.more' | transloco }}
      </button>
    }
  `,
  styles: `
    .party-tags {
      display: flex;
      gap: 0.3rem;
      flex-wrap: wrap;
      margin-block: 0.5rem;
    }
    form {
      margin-block: 0.75rem;
    }
  `,
})
export class PartyConversation implements OnDestroy {
  readonly comments = input<Status[]>([]);
  readonly root = input<Status | null>(null);
  readonly session = input.required<string>();
  readonly changed = output<Status>();
  readonly deleted = output<Status>();
  readonly replied = output<Status>();
  private api = inject(Api);
  private auth = inject(Auth);
  private streaming = inject(Streaming);
  private publicApi = inject(AnonymousPublicApi);
  private anonymous = inject(AnonymousAccount);
  private visibility = inject(StatusVisibility);
  protected draft = signal('');
  protected tags = signal<string[]>([]);
  protected validation = signal(false);
  protected failed = signal<string[]>([]);
  protected busy = signal<string[]>([]);
  private pages = signal<Record<string, Status[]>>({});
  private removed = signal<Set<string>>(new Set());
  private cursors = new Map<string, string>();
  private exhausted = signal<Set<string>>(new Set());
  private requests = new Map<string, Subscription>();
  private streams = new Map<string, Subscription>();
  private timer = setInterval(() => {
    if (!document.hidden) this.refresh();
  }, 30000);
  protected hasMore = computed(() => this.tags().some((tag) => !this.exhausted().has(tag)));
  protected mixed = computed(() => {
    const root = this.root();
    const rootKey = root ? canonicalStatusKey(root) : '';
    const replies = new Set(this.comments().map(canonicalStatusKey));
    const items = new Map<string, Status>();
    for (const status of [...Object.values(this.pages()).flat(), ...this.comments()]) {
      const key = canonicalStatusKey(status);
      if (key === rootKey || this.removed().has(key)) continue;
      const held = items.get(key);
      if (
        !held ||
        Date.parse(status.edited_at || status.created_at) >=
          Date.parse(held.edited_at || held.created_at)
      )
        items.set(key, status);
    }
    return [...items]
      .map(([key, status]) => ({
        key,
        status,
        context: replies.has(key) ? ('thread' as const) : ('public' as const),
      }))
      .filter((item) => !this.visibility.rendersNothing(item.status, item.context))
      .sort(
        (a, b) =>
          Date.parse(a.status.created_at) - Date.parse(b.status.created_at) ||
          a.key.localeCompare(b.key),
      );
  });
  constructor() {
    effect(() => {
      this.session();
      this.clear();
    });
  }
  addTag(raw: string): void {
    const tag = normalizeHashtag(raw);
    if (
      !tag ||
      (this.tags().length >= 8 &&
        !this.tags().some((item) => item.toLowerCase() === tag.toLowerCase()))
    ) {
      this.validation.set(true);
      return;
    }
    this.validation.set(false);
    if (this.tags().some((item) => item.toLowerCase() === tag.toLowerCase())) return;
    this.tags.update((tags) => [...tags, tag]);
    this.load(tag);
    if (this.auth.kind() === 'mastodon')
      this.streams.set(
        tag,
        this.streaming.open({ stream: 'hashtag', tag }).subscribe({
          next: (event) => this.event(tag, event),
          error: () => {
            /* Polling and explicit refresh remain available. */
          },
        }),
      );
  }
  protected addInput(): void {
    const raw = this.draft()
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean);
    if (raw.some((tag) => !normalizeHashtag(tag))) {
      this.validation.set(true);
      return;
    }
    const unique = new Set(
      [...this.tags(), ...raw.map((tag) => normalizeHashtag(tag)!)].map((tag) => tag.toLowerCase()),
    );
    if (unique.size > 8) {
      this.validation.set(true);
      return;
    }
    raw.forEach((tag) => this.addTag(tag));
    this.draft.set('');
  }
  protected removeTag(tag: string): void {
    this.requests.get(tag)?.unsubscribe();
    this.requests.delete(tag);
    this.streams.get(tag)?.unsubscribe();
    this.streams.delete(tag);
    this.tags.update((tags) => tags.filter((item) => item !== tag));
    this.busy.update((tags) => tags.filter((item) => item !== tag));
    this.failed.update((tags) => tags.filter((item) => item !== tag));
    this.pages.update((pages) => {
      const next = { ...pages };
      delete next[tag];
      return next;
    });
    this.cursors.delete(tag);
    this.exhausted.update((tags) => {
      const next = new Set(tags);
      next.delete(tag);
      return next;
    });
  }
  protected refresh(): void {
    this.tags().forEach((tag) => this.load(tag));
  }
  protected more(): void {
    this.tags()
      .filter((tag) => !this.exhausted().has(tag))
      .forEach((tag) => this.load(tag, true));
  }
  private load(tag: string, older = false): void {
    if (this.busy().includes(tag)) return;
    this.busy.update((tags) => [...tags, tag]);
    const cursor = older ? this.cursors.get(tag) : undefined;
    const request = this.auth.isAnonymous
      ? this.publicApi.getTagTimeline(this.anonymous.server(), tag, cursor)
      : this.api.tagTimeline(tag, cursor, 20);
    const sub = request.subscribe({
      next: (statuses) => {
        this.pages.update((pages) => {
          const merged = new Map(
            (pages[tag] ?? []).map((status) => [canonicalStatusKey(status), status]),
          );
          statuses.forEach((status) => merged.set(canonicalStatusKey(status), status));
          return {
            ...pages,
            [tag]: [...merged.values()]
              .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
              .slice(0, 200),
          };
        });
        if (older || !this.cursors.has(tag)) {
          const last = statuses.at(-1);
          if (last) this.cursors.set(tag, this.nativeId(last));
          this.exhausted.update((tags) => {
            const next = new Set(tags);
            if (statuses.length < 20 || (this.pages()[tag]?.length ?? 0) >= 200) next.add(tag);
            else next.delete(tag);
            return next;
          });
        }
        this.failed.update((tags) => tags.filter((item) => item !== tag));
        this.busy.update((tags) => tags.filter((item) => item !== tag));
      },
      error: () => {
        this.failed.update((tags) => [...new Set([...tags, tag])]);
        this.busy.update((tags) => tags.filter((item) => item !== tag));
      },
    });
    this.requests.set(tag, sub);
  }
  private nativeId(status: Status): string {
    return (status.providerRef as { statusId?: string } | undefined)?.statusId ?? status.id;
  }
  private event(tag: string, event: StreamEvent): void {
    if (event.event === 'delete') {
      const id = String(event.payload);
      for (const status of [...this.comments(), ...Object.values(this.pages()).flat()])
        if (this.nativeId(status) === id) this.erase(status);
      return;
    }
    if (event.event !== 'update' && event.event !== 'status.update') return;
    const status = event.payload as Status;
    if (!status?.id || !status.account || !Array.isArray(status.media_attachments)) return;
    this.pages.update((pages) => ({
      ...pages,
      [tag]: [
        status,
        ...(pages[tag] ?? []).filter(
          (item) => canonicalStatusKey(item) !== canonicalStatusKey(status),
        ),
      ].slice(0, 200),
    }));
  }
  protected update(status: Status): void {
    this.pages.update((pages) =>
      Object.fromEntries(
        Object.entries(pages).map(([tag, posts]) => [
          tag,
          posts.map((item) =>
            canonicalStatusKey(item) === canonicalStatusKey(status) ? status : item,
          ),
        ]),
      ),
    );
  }
  protected erase(status: Status): void {
    this.removed.update((items) => new Set([...items, canonicalStatusKey(status)]));
  }
  private clear(): void {
    this.requests.forEach((sub) => sub.unsubscribe());
    this.requests.clear();
    this.streams.forEach((sub) => sub.unsubscribe());
    this.streams.clear();
    this.tags.set([]);
    this.pages.set({});
    this.busy.set([]);
    this.failed.set([]);
    this.removed.set(new Set());
    this.exhausted.set(new Set());
    this.cursors.clear();
    this.draft.set('');
    this.validation.set(false);
  }
  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.clear();
  }
}
