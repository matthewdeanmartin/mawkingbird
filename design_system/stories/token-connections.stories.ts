import { importProvidersFrom, signal } from "@angular/core";
import { provideRouter, withDisabledInitialNavigation } from "@angular/router";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { of, throwError, delay } from "rxjs";
import { ConnectionGitHub } from "../../ui/src/app/pages/settings/connections/github/connection-github";
import { ConnectionGist } from "../../ui/src/app/pages/settings/connections/gist/connection-gist";
import { ConnectionRaindrop } from "../../ui/src/app/pages/settings/connections/raindrop/connection-raindrop";
import { GitHubSession } from "../../ui/src/app/providers/github/github-session";
import { GistSettings } from "../../ui/src/app/providers/paste/gist-settings";
import { GistProvider } from "../../ui/src/app/providers/paste/gist-provider";
import { RaindropSession } from "../../ui/src/app/providers/raindrop/raindrop-session";
import { VaultBridge } from "../../ui/src/app/providers/vault/vault-bridge";
import { PageDiagnostics } from "../../ui/src/app/page-diagnostics";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

function session() {
  const connected = signal(false);
  const user = {
    login: "preview",
    name: "Preview account",
    avatar_url: "",
    html_url: "https://github.com/preview",
  };
  return {
    connected,
    user: () => user,
    profile: () => user,
    notifications: signal<unknown[] | null>(null),
    following: () => [],
    needsFetch: () => false,
    expiresAt: () => null,
    enforceLifetime: () => undefined,
    connect: (token: string) => {
      if (token === "reject")
        throw new Error("Preview token rejected; nothing stored.");
      connected.set(true);
      return user;
    },
    disconnect: () => connected.set(false),
  };
}

export default {
  title: "Adoption/Token connections",
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([], withDisabledInitialNavigation()),
        importProvidersFrom(translocoTesting()),
        { provide: VaultBridge, useValue: { syncs: () => false } },
        { provide: PageDiagnostics, useValue: { error: () => undefined } },
        { provide: RaindropSession, useFactory: session },
        { provide: GistSettings, useFactory: session },
        {
          provide: GistProvider,
          useValue: {
            whoami: (token: string) =>
              token === "reject"
                ? throwError(() => new Error("Rejected"))
                : of({ login: "preview" }).pipe(delay(700)),
          },
        },
        {
          provide: GitHubSession,
          useFactory: () => {
            const preview = session();
            return {
              ...preview,
              connect: async (token: string) => {
                await new Promise((resolve) => setTimeout(resolve, 700));
                return preview.connect(token);
              },
              runProof: async () => {
                preview.notifications.set([]);
              },
            };
          },
        },
      ],
    }),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Real connection pages; in-memory fixtures only. Enter reject to exercise errors, any other dummy token to connect. No credentials are stored or sent. Raindrop preserves its save-only flow; GitHub and Gist simulate validation.",
      },
    },
  },
} satisfies Meta;

export const GitHub: StoryObj = {
  render: () => ({
    moduleMetadata: { imports: [ConnectionGitHub] },
    template: "<app-connection-github />",
  }),
};
export const Gist: StoryObj = {
  render: () => ({
    moduleMetadata: { imports: [ConnectionGist] },
    template: "<app-connection-gist />",
  }),
};
export const Raindrop: StoryObj = {
  render: () => ({
    moduleMetadata: { imports: [ConnectionRaindrop] },
    template: "<app-connection-raindrop />",
  }),
};
