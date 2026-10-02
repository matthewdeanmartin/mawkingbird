import {
  Component,
  Injectable,
  inject,
  signal,
  importProvidersFrom,
} from "@angular/core";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import {
  provideRouter,
  withDisabledInitialNavigation,
  withHashLocation,
} from "@angular/router";
import { Observable, of } from "rxjs";
import {
  provideHttpClient,
  withInterceptors,
  HttpResponse,
} from "../../ui/src/app/testing/storybook-http";
import { StatusCard } from "../../ui/src/app/status-card/status-card";
import { Status } from "../../ui/src/app/models";
import { Auth } from "../../ui/src/app/auth";
import { ClientPrefs } from "../../ui/src/app/client-prefs";
import { FeatureFlags } from "../../ui/src/app/feature-flags";
import { StatusActions } from "../../ui/src/app/providers/status-actions";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";
import {
  MbToolbar,
  MbToolbarButton,
} from "../../ui/src/app/design-system/toolbar/toolbar";

const avatar =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%2346535e'/%3E%3C/svg%3E";
function post(mode: string): Status {
  return {
    id: "review-post",
    created_at: "2026-09-28T12:00:00Z",
    edited_at: "2026-09-28T13:00:00Z",
    content:
      "<p>The real post toolbar, with all actions this provider supports. Compact counts and phone-sized labels leave more room for posts without removing tools.</p>",
    spoiler_text: "",
    visibility: "public",
    url: "https://social.example/@reader/review-post",
    account: {
      id: mode === "Own post" ? "viewer" : "author",
      username: "reader",
      acct: "reader@social.example",
      display_name: "A very long author name — internationale Zusammenarbeit",
      avatar,
      avatar_static: avatar,
      emojis: [],
      fields: [],
      note: "",
      url: "https://social.example/@reader",
      header: "",
      followers_count: 10,
      following_count: 20,
      statuses_count: 30,
      bot: false,
      locked: false,
    },
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 123456,
    reblogs_count: 2000000,
    favourites_count: 12345678,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: "public",
    media_attachments: [],
    emojis: [],
    provider: mode.startsWith("RSS")
      ? "rss"
      : mode === "Twitter"
        ? "twitter"
        : mode === "Bluesky"
          ? "bluesky"
          : "mastodon",
    providerRef:
      mode === "Bluesky"
        ? {
            uri: "at://did:plc:preview/app.bsky.feed.post/review",
            cid: "preview",
            likeUri: null,
            repostUri: null,
          }
        : undefined,
  } as Status;
}
@Injectable()
class ReviewActions {
  readonly pending = signal<{ finish: (fail: boolean) => void }[]>([]);
  toggleFavourite(status: Status) {
    return this.request(status, "favourited");
  }
  toggleReblog(status: Status) {
    return this.request(status, "reblogged");
  }
  private request(status: Status, field: "favourited" | "reblogged") {
    return new Observable<Status>((observer) => {
      const entry = {
        finish: (fail: boolean) => {
          if (fail) observer.error(new Error("Preview action failed"));
          else {
            observer.next({ ...status, [field]: !status[field] });
            observer.complete();
          }
        },
      };
      this.pending.update((entries) => [...entries, entry]);
      return () =>
        this.pending.update((entries) =>
          entries.filter((item) => item !== entry),
        );
    });
  }
  finish(fail: boolean) {
    for (const entry of this.pending()) entry.finish(fail);
  }
}
function preferences() {
  const prefs = new ClientPrefs();
  Object.defineProperties(prefs, {
    apply: { value: () => undefined },
    persist: { value: () => undefined },
  });
  return prefs;
}
function flags() {
  const flags = new FeatureFlags();
  Object.defineProperty(flags, "persist", { value: () => undefined });
  flags.setState("unified-share", "off");
  return flags;
}
@Component({
  selector: "ds-post-adoption-review",
  imports: [StatusCard, MbToolbar, MbToolbarButton],
  template: `<article class="ds-sheet">
    <h1>Real post tools, compact counts.</h1>
    <p class="ds-intro">
      Sprint 11 · Existing provider capabilities and power-user actions, shared
      compact geometry.
    </p>
    <mb-toolbar label="Preview account and provider" density="compact">
      @for (mode of modes; track mode) {
        <button
          mbToolbarButton
          [pressed]="selected() === mode"
          (click)="select(mode)"
        >
          {{ mode }}
        </button>
      }
    </mb-toolbar>
    <p>
      Like or boost, then complete or fail its local response. Requests are held
      so busy and rollback states can be inspected. These fixtures do not
      connect to a live provider.
    </p>
    <mb-toolbar label="Preview action responses" density="compact">
      <button
        mbToolbarButton
        [disabled]="!actions.pending().length"
        (click)="actions.finish(false)"
      >
        Complete action
      </button>
      <button
        mbToolbarButton
        [disabled]="!actions.pending().length"
        (click)="actions.finish(true)"
      >
        Fail action
      </button>
      <button mbToolbarButton [pressed]="unified()" (click)="toggleUnified()">
        Unified share preference
      </button>
      <button
        mbToolbarButton
        [pressed]="smallCounts()"
        (click)="toggleCounts()"
      >
        Small counts
      </button>
    </mb-toolbar>
    <section aria-label="Real post">
      @for (key of [selected()]; track key) {
        <app-status-card [status]="status()" (changed)="status.set($event)" />
      }
    </section>
    <p class="ds-intro">
      Compare the catalogue Accent choices: selected controls use the chosen
      soft tint; ordinary actions stay neutral. The default unified-share
      preference remains off. The separate Sprint 6 superset still shows tools
      that cannot coexist for one provider.
    </p>
  </article>`,
})
class PostAdoptionReview {
  readonly actions = inject(ReviewActions);
  private readonly auth = inject(Auth);
  private readonly flags = inject(FeatureFlags);
  readonly modes = [
    "Signed in",
    "Own post",
    "Anonymous",
    "RSS",
    "RSS anonymous",
    "Twitter",
    "Bluesky",
  ];
  readonly selected = signal("Signed in");
  readonly status = signal(post("Signed in"));
  readonly unified = signal(false);
  readonly smallCounts = signal(false);
  constructor() {
    this.select("Signed in");
  }
  select(mode: string) {
    this.actions.finish(true);
    const anonymous = mode === "Anonymous" || mode === "RSS anonymous";
    this.auth.kind.set(anonymous ? "anonymous" : "mastodon");
    this.auth.token.set(anonymous ? null : "preview-only-not-a-credential");
    this.auth.account.set({ ...post(mode).account, id: "viewer" });
    this.selected.set(mode);
    this.updateCounts();
  }
  toggleCounts() {
    this.smallCounts.update((value) => !value);
    this.updateCounts();
  }
  private updateCounts() {
    const status = post(this.selected());
    this.status.set(
      this.smallCounts()
        ? { ...status, replies_count: 2, reblogs_count: 3, favourites_count: 5 }
        : status,
    );
  }
  toggleUnified() {
    this.unified.update((value) => !value);
    this.flags.setState("unified-share", this.unified() ? "production" : "off");
  }
}
export default {
  title: "Start here/Sprint 11 review",
  component: PostAdoptionReview,
  decorators: [
    applicationConfig({
      providers: [
        ReviewActions,
        { provide: StatusActions, useExisting: ReviewActions },
        { provide: ClientPrefs, useFactory: preferences },
        { provide: FeatureFlags, useFactory: flags },
        importProvidersFrom(translocoTesting()),
        provideRouter([], withDisabledInitialNavigation(), withHashLocation()),
        provideHttpClient(
          withInterceptors([
            () => of(new HttpResponse({ status: 200, body: [] })),
          ]),
        ),
      ],
    }),
  ],
} satisfies Meta<PostAdoptionReview>;
export const ProviderTools: StoryObj<PostAdoptionReview> = {};
