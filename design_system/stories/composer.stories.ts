import { Component, importProvidersFrom, input, signal } from "@angular/core";
import { TagHelper } from "../../ui/src/app/compose/tag-helper";
import { AiTranslate } from "../../ui/src/app/ai-translate";
import { provideRouter, withDisabledInitialNavigation } from "@angular/router";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { Compose } from "../../ui/src/app/compose/compose";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";
import { Pseudonymity } from "../../ui/src/app/pseudonymity";
import { Api } from "../../ui/src/app/api";
import { ReplyMentions } from "../../ui/src/app/compose/reply-mentions";
import { Server } from "../../ui/src/app/server";
import { PageDiagnostics } from "../../ui/src/app/page-diagnostics";
import { Auth } from "../../ui/src/app/auth";
import { ClientPrefs } from "../../ui/src/app/client-prefs";
import { PostingLanguage } from "../../ui/src/app/posting-language";
import { PostConfirmation } from "../../ui/src/app/post-confirmation";
import { OpenRouterSession } from "../../ui/src/app/providers/openrouter/openrouter-session";
import { AiAvailability } from "../../ui/src/app/ai-availability";
import { CustomEmojis } from "../../ui/src/app/custom-emojis";
import { Drafts } from "../../ui/src/app/drafts";
import { BlueskyApi } from "../../ui/src/app/providers/bluesky/bluesky-api";
import { BlueskySession } from "../../ui/src/app/providers/bluesky/bluesky-session";
import { PasteHistory } from "../../ui/src/app/providers/paste/paste-history";
import { PasteProviderRegistry } from "../../ui/src/app/providers/paste/paste-provider-registry";
import { Terminology } from "../../ui/src/app/terminology";
import { FeatureFlags } from "../../ui/src/app/feature-flags";
import { KnownLanguages } from "../../ui/src/app/trend-language-filter";
import { MataroaApi } from "../../ui/src/app/providers/mataroa/mataroa-api";
import { MataroaSettings } from "../../ui/src/app/providers/mataroa/mataroa-settings";
import { BloggerApi } from "../../ui/src/app/providers/blogger/blogger-api";
import { BloggerSession } from "../../ui/src/app/providers/blogger/blogger-session";
import { HugoSettings } from "../../ui/src/app/providers/hugo/hugo-settings";
import { HugoPublish } from "../../ui/src/app/providers/hugo/hugo-publish";
import { HugoEditSession } from "../../ui/src/app/providers/hugo/hugo-edit-session";
import { HugoDeployWatch } from "../../ui/src/app/providers/hugo/hugo-deploy-watch";
import { CorsProxy } from "../../ui/src/app/providers/cors-proxy/cors-proxy";
import { ShortenerProxyConsent } from "../../ui/src/app/providers/shortener/proxy-consent";
import { ShortenerRegistry } from "../../ui/src/app/providers/shortener/shortener-registry";
import { ShortenerSettings } from "../../ui/src/app/providers/shortener/shortener-settings";

const idle = () => undefined;
const unavailable = () =>
  Promise.reject(new Error("AI requests are disabled in this preview."));
const disconnected = { connected: () => false, ready: () => false };
const drafts = {
  drafts: signal([]),
  takeHandoff: () => null,
  loadAutosave: () => null,
  autosave: () => ({ durable: true }),
  clearAutosave: idle,
  save: () => ({ durable: true }),
  remove: () => ({ durable: true }),
  get: () => null,
};
const providers = [
  provideRouter([], withDisabledInitialNavigation()),
  { provide: TagHelper, useValue: { run: unavailable } },
  { provide: AiTranslate, useValue: { translateText: unavailable } },
  importProvidersFrom(translocoTesting()),
  {
    provide: Auth,
    useValue: {
      isAnonymous: false,
      isBlueskyPrimary: false,
      account: signal({ id: "fixture", acct: "writer" }),
      token: () => "fixture-only",
    },
  },
  { provide: Api, useValue: {} },
  { provide: ReplyMentions, useValue: {} },
  { provide: Server, useValue: { baseUrl: () => "https://example.invalid" } },
  { provide: Pseudonymity, useValue: { cleanMedia: () => false } },
  {
    provide: PageDiagnostics,
    useValue: { info: idle, warn: idle, error: idle },
  },
  {
    provide: ClientPrefs,
    useValue: {
      defaultVisibility: () => "public",
      knownLanguages: () => ["en", "de", "fr"],
      thoughtfulPosting: () => false,
      requireAltText: () => false,
      pkmVocabulary: () => ({}),
      warnOnPkmPublish: () => false,
      delayedSend: () => false,
      themeMode: () => document.documentElement.dataset["theme"] || "light",
      addKnownLanguage: idle,
    },
  },
  { provide: PostingLanguage, useValue: { default: () => "en" } },
  { provide: PostConfirmation, useValue: { confirm: () => false } },
  { provide: Drafts, useValue: { forCurrentAccount: () => drafts } },
  {
    provide: CustomEmojis,
    useValue: { emojis: signal([]), ensureLoaded: idle },
  },
  { provide: AiAvailability, useValue: { enabled: () => true } },
  {
    provide: OpenRouterSession,
    useValue: { connected: () => true, apiKey: () => "" },
  },
  { provide: KnownLanguages, useValue: { codes: () => ["en", "de", "fr"] } },
  { provide: FeatureFlags, useValue: { enabled: () => true } },
  {
    provide: Terminology,
    useValue: {
      words: () => ({
        Post: "Post",
        post: "post",
        PostAll: "Post all",
        posts: "posts",
      }),
    },
  },
  {
    provide: BlueskySession,
    useValue: {
      linked: () => true,
      session: () => ({ did: "did:plc:fixture", handle: "writer.example" }),
    },
  },
  { provide: BlueskyApi, useValue: {} },
  { provide: MataroaSettings, useValue: disconnected },
  { provide: BloggerSession, useValue: disconnected },
  { provide: HugoSettings, useValue: disconnected },
  ...[MataroaApi, BloggerApi, HugoPublish, PasteHistory].map((provide) => ({
    provide,
    useValue: {},
  })),
  {
    provide: HugoEditSession,
    useValue: { current: signal(null), editing: () => false },
  },
  { provide: HugoDeployWatch, useValue: { current: signal(null), stop: idle } },
  {
    provide: PasteProviderRegistry,
    useValue: {
      default: { id: "fixture", label: "Fixture paste" },
      get: () => undefined,
    },
  },
  {
    provide: ShortenerSettings,
    useValue: { usable: () => false, chosen: () => null },
  },
  ...[ShortenerRegistry, ShortenerProxyConsent, CorsProxy].map((provide) => ({
    provide,
    useValue: {},
  })),
];

@Component({
  selector: "ds-composer-review",
  imports: [Compose],
  template: `
    <h1>Composer: all tools available</h1>
    <p>
      Real composer with local fixtures. Posting is blocked and drafts are not
      persisted.
    </p>
    <div style="width:100%;max-width:560px">
      <app-compose
        [compact]="compact()"
        [chatMode]="chat()"
        initialText="A preview with every available tool."
      />
    </div>
  `,
})
class ComposerReview {
  readonly compact = input(true);
  readonly chat = input(false);
}

export default {
  title: "Adoption/Composer",
  component: ComposerReview,
  decorators: [applicationConfig({ providers })],
} satisfies Meta<ComposerReview>;
export const Compact: StoryObj<ComposerReview> = {};
export const Full: StoryObj<ComposerReview> = { args: { compact: false } };
export const Chat: StoryObj<ComposerReview> = { args: { chat: true } };
