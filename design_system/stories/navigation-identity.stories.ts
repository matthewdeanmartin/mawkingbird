import {
  Component,
  effect,
  inject,
  Injectable,
  input,
  signal,
  importProvidersFrom,
} from "@angular/core";
import {
  provideRouter,
  withDisabledInitialNavigation,
  withHashLocation,
} from "@angular/router";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { BehaviorSubject, defer, delay, of } from "rxjs";
import { LeftRail } from "../../ui/src/app/shell/left-rail/left-rail";
import { RightRail } from "../../ui/src/app/shell/right-rail/right-rail";
import { RailProfiles } from "../../ui/src/app/shell/left-rail/profile-stack/rail-profiles";
import { RailProfile } from "../../ui/src/app/shell/left-rail/profile-stack/rail-profile";
import { AccountPreview } from "../../ui/src/app/account-hover-card/account-preview";
import { FollowButton } from "../../ui/src/app/follow-button/follow-button";
import { MbButton } from "../../ui/src/app/design-system/button/button";
import { Api } from "../../ui/src/app/api";
import { Auth } from "../../ui/src/app/auth";
import { ClientPrefs } from "../../ui/src/app/client-prefs";
import { FollowState } from "../../ui/src/app/follow-state";
import { HomeTimelineFeed } from "../../ui/src/app/home-timeline-feed";
import { Terminology } from "../../ui/src/app/terminology";
import { Account, Relationship } from "../../ui/src/app/models";
import { AnonymousAccount } from "../../ui/src/app/providers/anonymous/anonymous-account";
import { AnonymousFollows } from "../../ui/src/app/providers/anonymous/anonymous-follows";
import { BlueskyGraph } from "../../ui/src/app/providers/bluesky/bluesky-graph";
import { BlueskySession } from "../../ui/src/app/providers/bluesky/bluesky-session";
import { BlueskyTrends } from "../../ui/src/app/providers/bluesky/bluesky-trends";
import { MastodonConnector } from "../../ui/src/app/providers/mastodon/mastodon-connector";
import { AnnouncementStore } from "../../ui/src/app/announcements/announcement-store";
import { FeedCapability } from "../../ui/src/app/feed-capability";
import { HouseAdStore } from "../../ui/src/app/house-ad-store";
import { SearchServer } from "../../ui/src/app/search-server";
import { Server } from "../../ui/src/app/server";
import { JustMyServer } from "../../ui/src/app/just-my-server";
import { PlusPromotions } from "../../ui/src/app/providers/account/plus-promotion";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

const avatar =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#607080"/><circle cx="32" cy="25" r="12" fill="#fff"/><path d="M8 64a24 24 0 0 1 48 0" fill="#fff"/></svg>',
  );
const account = {
  id: "preview-person",
  username: "reader",
  acct: "reader@people.example",
  display_name: "A reader with a longer display name",
  url: "https://people.example/@reader",
  avatar,
  avatar_static: avatar,
  header: "",
  header_static: "",
  note: '<p>A profile biography with <a href="https://example.com">an independent link</a>.</p>',
  statuses_count: 1250,
  following_count: 87,
  followers_count: 1200000,
  locked: true,
  fields: [],
  emojis: [],
} as unknown as Account;

@Injectable()
class IdentityState {
  readonly mode = signal("mastodon");
  readonly failNext = signal(false);
  readonly statuses = signal<Record<string, string>>({
    following: "following",
    requested: "requested",
  });
  readonly busy = signal<string | null>(null);
  readonly enabled = signal(false);
  readonly dialogOpen = signal(false);
  readonly updating = signal(false);
  readonly result = signal<unknown>(null);
  readonly ads = signal([
    {
      id: "preview",
      kind: "endorsement",
      title: "An independent project",
      text: "A clearly disclosed recommendation.",
      cta: "Explore the project",
      url: "https://example.com/project",
    },
  ]);
  readonly relationship = signal({
    id: account.id,
    following: false,
    requested: false,
    followed_by: true,
  } as Relationship);
  readonly profiles = signal<RailProfile[]>([
    {
      key: "preview-mastodon",
      network: "Mastodon",
      badge: "🐘",
      displayName: "A reader",
      handle: "reader@people.example",
      avatar,
      bioHtml: account.note,
      stats: [
        {
          label: "Followers",
          value: 1200000,
          link: ["/accounts", "preview-person"],
          queryParams: { tab: "followers" },
        },
      ],
      link: ["/accounts", "preview-person"],
      active: true,
    },
    {
      key: "preview-bluesky",
      network: "Bluesky",
      badge: "🦋",
      displayName: "Another identity",
      handle: "reader.example",
      avatar,
      bioText: "The same person, another network.",
      stats: [],
      href: "https://bsky.app/profile/reader.example",
      active: false,
    },
  ]);
  async toggle(id: string) {
    this.busy.set(id);
    await new Promise((resolve) => setTimeout(resolve, 350));
    this.busy.set(null);
    if (this.failNext()) {
      this.failNext.set(false);
      return false;
    }
    this.statuses.update((value) => ({
      ...value,
      [id]: ["following", "requested"].includes(value[id])
        ? "not-following"
        : "requested",
    }));
    return true;
  }
}

function services() {
  const state = inject(IdentityState);
  return {
    auth: {
      account: signal({
        ...account,
        id: "viewer",
        acct: "viewer@home.example",
        url: "https://home.example/@viewer",
      }),
      get isAnonymous() {
        return state.mode() === "anonymous";
      },
      get isAuthenticated() {
        return state.mode() !== "anonymous";
      },
      get isBlueskyPrimary() {
        return state.mode() === "bluesky";
      },
    },
    api: {
      relationships: () => of([state.relationship()]).pipe(delay(100)),
      follow: () =>
        defer(() => {
          state.relationship.update((value) => ({ ...value, requested: true }));
          return of(state.relationship()).pipe(delay(350));
        }),
      unfollow: () =>
        defer(() => {
          state.relationship.update((value) => ({
            ...value,
            following: false,
            requested: false,
          }));
          return of(state.relationship()).pipe(delay(350));
        }),
      trendingTags: () => of([{ name: "reading", history: [{ uses: "123" }] }]),
      instanceInfo: () =>
        of({
          domain: "home.example",
          title: "Home server",
          version: "4.4",
          usage: { users: { active_month: 42 } },
        }),
    },
  };
}

const providers = [
  IdentityState,
  { provide: Auth, useFactory: () => services().auth },
  { provide: Api, useFactory: () => services().api },
  { provide: ClientPrefs, useValue: { verifiedMode: signal("off") } },
  {
    provide: Terminology,
    useValue: { words: signal({ Boosted: "Boosted", posts: "posts" }) },
  },
  {
    provide: RailProfiles,
    useFactory: () => ({
      profiles: inject(IdentityState).profiles,
      load: () => undefined,
    }),
  },
  {
    provide: HomeTimelineFeed,
    useValue: {
      loaded: new BehaviorSubject([
        {
          account: {
            id: "booster",
            acct: "booster",
            url: "https://home.example/@booster",
          },
          reblog: { account },
          created_at: "2026-01-01T00:00:00Z",
          provider: "mastodon",
        },
      ]),
    },
  },
  {
    provide: FollowState,
    useFactory: () => {
      const state = inject(IdentityState);
      return {
        resolve: async () => undefined,
        status: (id: string) => state.statuses()[id] ?? "not-following",
        busyWith: (id: string) => state.busy() === id,
        excludesSuggestion: () => false,
        toggle: (id: string) => state.toggle(id),
      };
    },
  },
  {
    provide: AnonymousAccount,
    useValue: { server: signal("https://home.example") },
  },
  {
    provide: AnonymousFollows,
    useFactory: () => {
      const state = inject(IdentityState);
      return {
        isFollowing: () => false,
        relationship: () => state.relationship(),
        follow: () => {
          state.relationship.update((value) => ({ ...value, following: true }));
          return { ok: true, relationship: state.relationship() };
        },
        unfollow: () => {
          state.relationship.update((value) => ({
            ...value,
            following: false,
          }));
          return state.relationship();
        },
      };
    },
  },
  {
    provide: BlueskyGraph,
    useValue: {
      relationship: () => of({ following: false }),
      follow: () => of({ following: true }),
      unfollow: () => of({ following: false }),
    },
  },
  {
    provide: BlueskySession,
    useFactory: () => {
      const state = inject(IdentityState);
      return {
        linked: () => state.mode() === "bluesky",
        session: () =>
          state.mode() === "bluesky"
            ? { handle: "reader.example", service: "https://bsky.social" }
            : null,
      };
    },
  },
  { provide: MastodonConnector, useValue: { optedIn: signal(false) } },
  {
    provide: BlueskyTrends,
    useValue: {
      ensure: () => undefined,
      trends: signal([
        {
          url: "https://bsky.app/profile/reader.example/feed/reading",
          displayName: "Reading",
          postCount: 42,
        },
      ]),
    },
  },
  {
    provide: AnnouncementStore,
    useValue: {
      total: signal(1),
      activeCount: signal(1),
      hasUnread: signal(true),
      load: () => undefined,
      dismissAll: () => undefined,
    },
  },
  {
    provide: FeedCapability,
    useValue: { shows: () => true, ensure: async () => undefined },
  },
  {
    provide: HouseAdStore,
    useFactory: () => {
      const state = inject(IdentityState);
      return {
        visible: state.ads,
        recordClick: () => undefined,
        dismiss: () => state.ads.set([]),
      };
    },
  },
  { provide: PlusPromotions, useValue: { visible: signal(false) } },
  {
    provide: SearchServer,
    useValue: {
      active: signal(true),
      host: signal("search.example"),
      donateUrl: signal("https://search.example/about"),
    },
  },
  { provide: Server, useValue: { baseUrl: signal("https://home.example") } },
  {
    provide: JustMyServer,
    useFactory: () => {
      const state = inject(IdentityState);
      return {
        enabled: state.enabled,
        ready: signal(true),
        updating: state.updating,
        preparing: signal(false),
        checking: signal(false),
        error: signal(""),
        result: state.result,
        homeHost: signal("home.example"),
        dialogOpen: state.dialogOpen,
        plan: signal({ addIds: ["a"], removeIds: [], alreadyPresent: 2 }),
        listTitle: signal("Home friends"),
        completed: signal(0),
        total: signal(1),
        progressLabel: signal("0 / 1"),
        checkList: () => undefined,
        requestEnabled: (value: boolean) => state.enabled.set(value),
        prepareUpdate: () => state.dialogOpen.set(true),
        closeDialog: () => {
          if (!state.updating()) state.dialogOpen.set(false);
        },
        confirmUpdate: async () => {
          state.updating.set(true);
          await new Promise((resolve) => setTimeout(resolve, 500));
          state.updating.set(false);
          state.result.set({
            added: 1,
            removed: 0,
            alreadyPresent: 2,
            failed: 0,
          });
          state.dialogOpen.set(false);
        },
      };
    },
  },
];

@Component({
  selector: "ds-identity-preview",
  imports: [LeftRail, RightRail, AccountPreview, FollowButton, MbButton],
  template: `
    <h1>Navigation and identity</h1>
    <p>
      Real app components with preview-only services. Profile selection is
      remembered only on this preview origin. No account switch or live follow
      is performed.
    </p>
    <div class="preview-grid">
      <app-left-rail />
      <section aria-label="Account controls">
        <app-account-preview [account]="account"
          ><strong>Profile preview</strong></app-account-preview
        >
        <p><app-follow-button accountId="new-person" handle="@new-person" /></p>
        <p><app-follow-button accountId="following" handle="@following" /></p>
        <p><app-follow-button accountId="requested" handle="@requested" /></p>
        <button
          mbButton
          variant="outline"
          type="button"
          (click)="state.failNext.set(true)"
        >
          Fail next follow
        </button>
      </section>
      <app-right-rail />
    </div>
  `,
  styles: `
    .preview-grid {
      display: grid;
      gap: 20px;
      grid-template-columns: minmax(0, 1fr);
    }
    .preview-grid > * {
      min-width: 0;
    }
    @media (min-width: 1000px) {
      .preview-grid {
        grid-template-columns: minmax(0, 290px) minmax(0, 1fr) minmax(0, 290px);
      }
    }
  `,
})
class IdentityPreview {
  readonly state = inject(IdentityState);
  readonly mode = input("mastodon");
  readonly account = account;
  constructor() {
    effect(() => this.state.mode.set(this.mode()));
  }
}

export default {
  title: "Adoption/Navigation and identity",
  component: IdentityPreview,
  render: (args) => ({
    props: args,
    template: '<ds-identity-preview [mode]="mode" />',
  }),
  decorators: [
    applicationConfig({
      providers: [
        importProvidersFrom(translocoTesting()),
        provideRouter([], withDisabledInitialNavigation(), withHashLocation()),
        ...providers,
      ],
    }),
  ],
} satisfies Meta<IdentityPreview>;
export const Mastodon: StoryObj<IdentityPreview> = {
  args: { mode: "mastodon" },
};
export const Anonymous: StoryObj<IdentityPreview> = {
  args: { mode: "anonymous" },
};
export const Bluesky: StoryObj<IdentityPreview> = { args: { mode: "bluesky" } };
