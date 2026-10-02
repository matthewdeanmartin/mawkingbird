import { importProvidersFrom, signal } from "@angular/core";
import { provideRouter } from "@angular/router";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { defer, of, throwError, delay, tap } from "rxjs";
import { ConnectionMastodon } from "../../ui/src/app/pages/settings/connections/mastodon/connection-mastodon";
import { ConnectionBluesky } from "../../ui/src/app/pages/settings/connections/bluesky/connection-bluesky";
import { ConnectionDropbox } from "../../ui/src/app/pages/settings/connections/dropbox/connection-dropbox";
import { MastodonConnector } from "../../ui/src/app/providers/mastodon/mastodon-connector";
import { BlueskySession } from "../../ui/src/app/providers/bluesky/bluesky-session";
import { DropboxSession } from "../../ui/src/app/providers/dropbox/dropbox-session";
import { AnonymousCapabilities } from "../../ui/src/app/providers/anonymous/anonymous-capabilities";
import { Api } from "../../ui/src/app/api";
import { Auth } from "../../ui/src/app/auth";
import { Server } from "../../ui/src/app/server";
import { MastodonServers } from "../../ui/src/app/mastodon-servers";
import { PageDiagnostics } from "../../ui/src/app/page-diagnostics";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

function mastodonProviders() {
  const current = signal({ state: "absent" });
  const server = signal<string | null>(null);
  let token = "";
  return [
    {
      provide: Auth,
      useValue: {
        isBlueskyPrimary: true,
        isAnonymous: false,
        connectMastodon: (value: string) => {
          token = value;
        },
        disconnectMastodon: () => {
          token = "";
        },
      },
    },
    {
      provide: Api,
      useValue: {
        verifyCredentials: () =>
          defer(() =>
            token === "reject"
              ? throwError(() => new Error("Preview rejection"))
              : of({ id: "preview" }).pipe(delay(500)),
          ),
      },
    },
    { provide: Server, useValue: { setBaseUrl: () => undefined } },
    {
      provide: MastodonServers,
      useValue: {
        source: signal("bundled"),
        ready: async () => undefined,
        shuffled: () => [],
      },
    },
    {
      provide: MastodonConnector,
      useValue: {
        current,
        server,
        enableAnonymous: () => {
          server.set("https://mastodon.social");
          current.set({ state: "anonymous" });
        },
        setServer: (value: string) => {
          server.set(value);
          current.set({ state: "anonymous" });
        },
        signIn: () => current.set({ state: "signed-in" }),
        signOut: () => current.set({ state: "anonymous" }),
        disable: () => {
          current.set({ state: "absent" });
          server.set(null);
        },
      },
    },
  ];
}

export default {
  title: "Adoption/Account connections",
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        importProvidersFrom(translocoTesting()),
        { provide: PageDiagnostics, useValue: { error: () => undefined } },
      ],
    }),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Production connection pages with memory-only sessions. No sign-in redirects, network calls, or credential writes. Enter reject for credential failure. Mastodon discovery uses an empty fixture directory. Dropbox has a long fixture listing for dialog scrolling.",
      },
    },
  },
} satisfies Meta;

export const Mastodon: StoryObj = {
  render: () => ({
    applicationConfig: { providers: mastodonProviders() },
    moduleMetadata: { imports: [ConnectionMastodon] },
    template: "<app-connection-mastodon />",
  }),
};
export const Bluesky: StoryObj = {
  render: () => ({
    applicationConfig: {
      providers: [
        { provide: AnonymousCapabilities, useValue: { active: true } },
        {
          provide: BlueskySession,
          useFactory: () => {
            const session = signal<{
              handle: string;
              displayName: string;
            } | null>(null);
            return {
              session,
              expiresAt: () => null,
              enforceLifetime: () => undefined,
              unlink: () => session.set(null),
              login: (handle: string, password: string) =>
                password === "reject"
                  ? throwError(() => new Error("Preview rejection"))
                  : of({ handle, displayName: "Preview account" }).pipe(
                      delay(500),
                      tap((value) => session.set(value)),
                    ),
            };
          },
        },
      ],
    },
    moduleMetadata: { imports: [ConnectionBluesky] },
    template: "<app-connection-bluesky />",
  }),
};
export const Dropbox: StoryObj = {
  render: () => ({
    applicationConfig: {
      providers: [
        {
          provide: DropboxSession,
          useFactory: () => {
            const connected = signal(false);
            return {
              configured: true,
              connected,
              connect: async () => connected.set(true),
              disconnect: () => connected.set(false),
              listRoot: async () => {
                await new Promise((resolve) => setTimeout(resolve, 500));
                return Array.from({ length: 35 }, (_, index) => ({
                  id: String(index),
                  ".tag": "file",
                  name:
                    index === 0
                      ? "Long_filename_without_breaks_".repeat(5) + ".txt"
                      : `Preview file ${index + 1}.txt`,
                }));
              },
            };
          },
        },
      ],
    },
    moduleMetadata: { imports: [ConnectionDropbox] },
    template: "<app-connection-dropbox />",
  }),
};
