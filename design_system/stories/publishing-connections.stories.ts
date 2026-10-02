import { importProvidersFrom, signal } from "@angular/core";
import { provideRouter, withDisabledInitialNavigation } from "@angular/router";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { of, throwError, delay } from "rxjs";
import { ConnectionBlogger } from "../../ui/src/app/pages/settings/connections/blogger/connection-blogger";
import { ConnectionHugo } from "../../ui/src/app/pages/settings/connections/hugo/connection-hugo";
import { ConnectionMataroa } from "../../ui/src/app/pages/settings/connections/mataroa/connection-mataroa";
import { ConnectionPastes } from "../../ui/src/app/pages/settings/connections/pastes/connection-pastes";
import { BloggerSession } from "../../ui/src/app/providers/blogger/blogger-session";
import { BloggerApi } from "../../ui/src/app/providers/blogger/blogger-api";
import { MataroaSettings } from "../../ui/src/app/providers/mataroa/mataroa-settings";
import { MataroaApi } from "../../ui/src/app/providers/mataroa/mataroa-api";
import {
  HugoSettings,
  type HugoRepo,
} from "../../ui/src/app/providers/hugo/hugo-settings";
import { HugoValidate } from "../../ui/src/app/providers/hugo/hugo-validate";
import { HugoPosts } from "../../ui/src/app/providers/hugo/hugo-posts";
import { HugoFeed } from "../../ui/src/app/providers/hugo/hugo-feed";
import { HugoEditSession } from "../../ui/src/app/providers/hugo/hugo-edit-session";
import { GitHubSession } from "../../ui/src/app/providers/github/github-session";
import { PasteSettings } from "../../ui/src/app/providers/paste/paste-settings";
import { PasteProviderRegistry } from "../../ui/src/app/providers/paste/paste-provider-registry";
import { PasteFeedSubscriptions } from "../../ui/src/app/providers/paste/paste-feed-subscriptions";
import { PasteFeedFetch } from "../../ui/src/app/providers/paste/paste-feed-fetch";
import { CorsProxy } from "../../ui/src/app/providers/cors-proxy/cors-proxy";
import { ProxyConsent } from "../../ui/src/app/providers/proxy-consent-store";
import { VaultBridge } from "../../ui/src/app/providers/vault/vault-bridge";
import { PageDiagnostics } from "../../ui/src/app/page-diagnostics";
import { ClientPrefs } from "../../ui/src/app/client-prefs";
import { Drafts } from "../../ui/src/app/drafts";
import { Terminology } from "../../ui/src/app/terminology";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

export default {
  title: "Adoption/Publishing connections",
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([], withDisabledInitialNavigation()),
        importProvidersFrom(translocoTesting()),
        { provide: VaultBridge, useValue: { syncs: () => false } },
        {
          provide: PageDiagnostics,
          useValue: { error: () => undefined, warn: () => undefined },
        },
        {
          provide: Terminology,
          useValue: { words: () => ({ post: "post", posts: "posts" }) },
        },
        {
          provide: CorsProxy,
          useValue: {
            entry: () => ({
              id: "custom",
              label: "Preview proxy",
              forwardsCustomHeaders: true,
            }),
            available: () => true,
          },
        },
        {
          provide: ProxyConsent,
          useValue: {
            grant: () => undefined,
            revoke: () => undefined,
            revokeAll: () => undefined,
          },
        },
      ],
    }),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Real settings pages backed only by memory fixtures. No publishing, OAuth redirects, remote reads, credential writes or real proxy consent. Use reject for validation failure. Paste inspection is separate from making a default.",
      },
    },
  },
} satisfies Meta;

export const Blogger: StoryObj = {
  render: () => ({
    moduleMetadata: { imports: [ConnectionBlogger] },
    template: "<app-connection-blogger />",
    applicationConfig: {
      providers: [
        {
          provide: BloggerSession,
          useFactory: () => {
            const connected = signal(true),
              blogId = signal<string | null>(null),
              blogName = signal<string | null>(null),
              includeInProfile = signal(false),
              ownClientId = signal("");
            return {
              configured: true,
              connected,
              blogId,
              blogName,
              includeInProfile,
              ownClientId,
              connect: async () => connected.set(true),
              disconnect: () => connected.set(false),
              forget: () => {
                connected.set(false);
                blogId.set(null);
                blogName.set(null);
              },
              chooseBlog: (id: string, name: string) => {
                blogId.set(id);
                blogName.set(name);
              },
              setIncludeInProfile: (value: boolean) =>
                includeInProfile.set(value),
              setOwnClientId: (value: string) => {
                ownClientId.set(value);
                connected.set(false);
              },
            };
          },
        },
        {
          provide: BloggerApi,
          useValue: {
            listBlogs: async () => [
              {
                id: "one",
                name: "First preview blog",
                url: "https://example.test/first",
              },
              {
                id: "two",
                name: "Second preview blog",
                url: "https://example.test/second",
              },
            ],
          },
        },
      ],
    },
  }),
};

export const Mataroa: StoryObj = {
  render: () => {
    let token = "";
    const connected = signal(false),
      blogUrl = signal(""),
      includeInProfile = signal(false);
    return {
      moduleMetadata: { imports: [ConnectionMataroa] },
      template: "<app-connection-mataroa />",
      applicationConfig: {
        providers: [
          {
            provide: MataroaSettings,
            useValue: {
              connected,
              blogUrl,
              includeInProfile,
              enforceLifetime: () => undefined,
              expiresAt: () => null,
              needsFetch: () => false,
              connect: (key: string, url: string, include: boolean) => {
                token = key;
                blogUrl.set(url);
                includeInProfile.set(include);
                connected.set(true);
              },
              disconnect: () => connected.set(false),
              setIncludeInProfile: (value: boolean) =>
                includeInProfile.set(value),
            },
          },
          {
            provide: MataroaApi,
            useValue: {
              listPosts: () =>
                token === "reject"
                  ? throwError(() => new Error("Preview rejection"))
                  : of([]).pipe(delay(500)),
            },
          },
        ],
      },
    };
  },
};

export const Hugo: StoryObj = {
  render: () => ({
    moduleMetadata: { imports: [ConnectionHugo] },
    template: "<app-connection-hugo />",
    applicationConfig: {
      providers: [
        {
          provide: HugoSettings,
          useFactory: () => {
            const repo = signal<HugoRepo | null>(null),
              token = signal<string | null>(null),
              includeInProfile = signal(false),
              posseEnabled = signal(false);
            return {
              repo,
              token,
              includeInProfile,
              posseEnabled,
              connected: () => !!token(),
              needsFetch: () => false,
              expiresAt: () => null,
              enforceLifetime: () => undefined,
              siteUrl: () => repo()?.siteUrl,
              slug: () => `${repo()?.owner}/${repo()?.repo}`,
              connect: (key: string, value: HugoRepo) => {
                token.set(key);
                repo.set(value);
              },
              disconnect: () => {
                token.set(null);
                repo.set(null);
              },
              setIncludeInProfile: (value: boolean) =>
                includeInProfile.set(value),
              setPosse: (value: boolean) => posseEnabled.set(value),
            };
          },
        },
        {
          provide: HugoValidate,
          useValue: {
            check: async (token: string) => {
              await new Promise((resolve) => setTimeout(resolve, 500));
              return token === "reject"
                ? { ok: false, problem: "Preview repository rejected." }
                : { ok: true, postCount: 0, looksLikeHugo: true };
            },
          },
        },
        {
          provide: HugoPosts,
          useValue: {
            load: async () => undefined,
            reset: () => undefined,
            loading: () => false,
            error: () => null,
            rows: () => [],
            hasMoreToHydrate: () => false,
          },
        },
        {
          provide: HugoFeed,
          useFactory: () => {
            const subscribed = signal(false);
            return {
              subscribed,
              subscribe: async () => {
                subscribed.set(true);
                return { ok: true };
              },
              unsubscribe: () => subscribed.set(false),
            };
          },
        },
        { provide: GitHubSession, useValue: { user: () => null } },
        { provide: HugoEditSession, useValue: {} },
        { provide: Drafts, useValue: { forCurrentAccount: () => ({}) } },
        { provide: ClientPrefs, useValue: {} },
      ],
    },
  }),
};

export const Pastes: StoryObj = {
  render: () => {
    const selected = signal("rentry"),
      followed = signal(false),
      proxy = signal(false);
    const providers = [
      {
        id: "rentry",
        label: "Rentry",
        immutable: false,
        expiries: [{ value: "never", label: "Never" }],
      },
      {
        id: "gist",
        label: "GitHub Gist",
        immutable: false,
        expiries: [{ value: "never", label: "Never" }],
      },
    ];
    return {
      moduleMetadata: { imports: [ConnectionPastes] },
      template: "<app-connection-pastes />",
      applicationConfig: {
        providers: [
          {
            provide: PasteSettings,
            useValue: {
              selected,
              select: (value: string) => {
                selected.set(value);
                return true;
              },
            },
          },
          {
            provide: PasteProviderRegistry,
            useValue: {
              all: providers,
              feeds: [
                {
                  id: "fixture-feed",
                  label: "Preview public feed",
                  feedUrl: "https://example.test/feed",
                },
              ],
              get default() {
                return providers.find((entry) => entry.id === selected())!;
              },
              get: (id: string) => providers.find((entry) => entry.id === id),
              available: () => providers,
            },
          },
          {
            provide: PasteFeedSubscriptions,
            useValue: {
              has: followed,
              follow: () => followed.set(true),
              unfollow: () => followed.set(false),
              usesProxy: proxy,
              setUseProxy: (_id: string, value: boolean) => proxy.set(value),
            },
          },
          {
            provide: PasteFeedFetch,
            useValue: { proxyLabel: () => "Preview proxy" },
          },
        ],
      },
    };
  },
};
