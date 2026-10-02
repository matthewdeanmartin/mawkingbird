import { importProvidersFrom, signal } from "@angular/core";
import { provideRouter } from "@angular/router";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { of, delay, throwError } from "rxjs";
import { parseHandles } from "../../ui/src/app/providers/twitter/twitter-import";
import { ConnectionTwitter } from "../../ui/src/app/pages/settings/connections/twitter/connection-twitter";
import { TwitterSettings } from "../../ui/src/app/providers/twitter/twitter-settings";
import { TwitterUsage } from "../../ui/src/app/providers/twitter/twitter-usage";
import { TwitterFeed } from "../../ui/src/app/providers/twitter/twitter-feed";
import { TwitterFollows } from "../../ui/src/app/providers/twitter/twitter-follows";
import { TwitterReachability } from "../../ui/src/app/providers/twitter/twitter-reachability";
import { TwitterApi } from "../../ui/src/app/providers/twitter/twitter-api";
import { TwitterPacer } from "../../ui/src/app/providers/twitter/twitter-pacer";
import { TwitterImport } from "../../ui/src/app/providers/twitter/twitter-import";
import { CorsProxy } from "../../ui/src/app/providers/cors-proxy/cors-proxy";
import { ProxyConsent } from "../../ui/src/app/providers/proxy-consent-store";
import { VaultBridge } from "../../ui/src/app/providers/vault/vault-bridge";
import { PageDiagnostics } from "../../ui/src/app/page-diagnostics";
import { Terminology } from "../../ui/src/app/terminology";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

export default {
  title: "Adoption/Account connections",
  component: ConnectionTwitter,
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        importProvidersFrom(translocoTesting()),
        {
          provide: TwitterSettings,
          useFactory: () => {
            const saved = signal(false);
            return {
              activeId: () => (saved() ? "twitterapi-io" : null),
              hasKey: saved,
              enforceLifetime: () => undefined,
              directReachability: () => "untested",
              usable: () => false,
              setKey: () => saved.set(true),
              activate: () => undefined,
              forget: () => saved.set(false),
              expiresAt: () => null,
              needsFetch: () => [],
            };
          },
        },
        {
          provide: TwitterUsage,
          useFactory: () => {
            const softLimit = signal(100),
              hardLimit = signal(200);
            return {
              softLimit,
              hardLimit,
              today: () => 0,
              total: () => 0,
              remainingToday: hardLimit,
              atHardLimit: () => false,
              overSoftLimit: () => false,
              setLimits: (soft: number, hard: number) => {
                softLimit.set(soft);
                hardLimit.set(hard);
              },
              reset: () => undefined,
            };
          },
        },
        { provide: TwitterFeed, useValue: { storedCount: async () => 0 } },
        { provide: TwitterFollows, useValue: {} },
        {
          provide: TwitterReachability,
          useValue: {
            probe: () =>
              of({
                status: "unavailable",
                message: "Preview only: request blocked; no API key was sent.",
              }).pipe(delay(500)),
          },
        },
        { provide: TwitterApi, useValue: {} },
        { provide: TwitterPacer, useValue: {} },
        { provide: TwitterImport, useValue: {} },
        {
          provide: CorsProxy,
          useValue: { entry: () => null, available: () => false },
        },
        {
          provide: ProxyConsent,
          useValue: { granted: () => false, revokeAll: () => undefined },
        },
        { provide: VaultBridge, useValue: { syncs: () => false } },
        { provide: PageDiagnostics, useValue: { error: () => undefined } },
        {
          provide: Terminology,
          useValue: { words: () => ({ posts: "posts" }) },
        },
      ],
    }),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Real Twitter controls with memory-only fixtures. Setup probes are blocked; the Controls story exposes spending, local follows and import selection. No credential writes, paid requests or proxy traffic.",
      },
    },
  },
} satisfies Meta<ConnectionTwitter>;
export const TwitterSetup: StoryObj<ConnectionTwitter> = {};

export const TwitterControls: StoryObj<ConnectionTwitter> = {
  render: () => {
    const saved = signal(true),
      consented = signal(true);
    const follows = signal([
      {
        username: "preview",
        displayName: "Preview account",
        enabled: true,
        userId: "one",
        avatar: "",
      },
    ]);
    const candidates = signal([
      {
        userId: "two",
        username: "candidate",
        displayName: "Candidate account",
        excluded: "",
        checked: true,
        lastPostedAt: "2026-09-20",
      },
    ]);
    const add = (value: {
      username: string;
      displayName: string;
      userId: string;
      avatar?: string;
    }) => {
      follows.update((rows) => [
        ...rows,
        { ...value, avatar: value.avatar ?? "", enabled: true },
      ]);
      return null;
    };
    return {
      props: {},
      template: "<app-connection-twitter />",
      moduleMetadata: { imports: [ConnectionTwitter] },
      applicationConfig: {
        providers: [
          {
            provide: TwitterSettings,
            useValue: {
              activeId: () => (saved() ? "twitterapi-io" : null),
              hasKey: saved,
              usable: saved,
              directReachability: () => "blocked",
              enforceLifetime: () => undefined,
              expiresAt: () => null,
              needsFetch: () => [],
              setKey: () => saved.set(true),
              activate: () => undefined,
              forget: () => saved.set(false),
            },
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
              granted: consented,
              grant: () => consented.set(true),
              revoke: () => consented.set(false),
              revokeAll: () => consented.set(false),
            },
          },
          {
            provide: TwitterFollows,
            useValue: {
              follows,
              enabled: () => follows().filter((row) => row.enabled),
              has: (username: string) =>
                follows().some((row) => row.username === username),
              atLimit: () => false,
              add,
              remove: (username: string) =>
                follows.update((rows) =>
                  rows.filter((row) => row.username !== username),
                ),
              setEnabled: (username: string, enabled: boolean) =>
                follows.update((rows) =>
                  rows.map((row) =>
                    row.username === username ? { ...row, enabled } : row,
                  ),
                ),
            },
          },
          {
            provide: TwitterFeed,
            useValue: {
              storedCount: async () => 0,
              estimateCost: () => 0,
              clear: async () => undefined,
              refreshMany: () => of({ loaded: 0, failed: [], stopped: false }),
            },
          },
          { provide: TwitterPacer, useValue: { delayMs: () => 1000 } },
          {
            provide: TwitterApi,
            useValue: {
              getBalance: () => of({ total: 1000 }),
              getProfile: () =>
                throwError(() => new Error("Preview lookup blocked")),
            },
          },
          {
            provide: TwitterImport,
            useValue: {
              candidates,
              keeping: () => candidates().filter((row) => !row.excluded),
              excluded: () => candidates().filter((row) => row.excluded),
              unchecked: () => [],
              running: () => false,
              phase: () => "idle",
              error: () => null,
              requests: () => 1,
              checked: () => 1,
              throttled: () => false,
              checkSeconds: () => 0,
              toggle: (id: string) =>
                candidates.update((rows) =>
                  rows.map((row) =>
                    row.userId === id
                      ? {
                          ...row,
                          excluded: row.excluded ? "" : "Skipped by you",
                        }
                      : row,
                  ),
                ),
              list: async () => undefined,
              stop: () => undefined,
              checkLiveness: async () => undefined,
              reset: () => candidates.set([]),
              apply: () => {
                const rows = candidates().filter((row) => !row.excluded);
                rows.forEach(add);
                return {
                  added: rows.length,
                  already: 0,
                  skipped: candidates().length - rows.length,
                  capped: 0,
                };
              },
              followPasted: (text: string) => {
                const handles = parseHandles(text);
                handles.forEach((username) =>
                  add({ username, userId: username, displayName: username }),
                );
                return {
                  added: handles.length,
                  already: 0,
                  invalid: 0,
                  capped: 0,
                };
              },
            },
          },
        ],
      },
    };
  },
};
