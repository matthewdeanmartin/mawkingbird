import { Component, importProvidersFrom, signal } from "@angular/core";
import { provideRouter, withDisabledInitialNavigation } from "@angular/router";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { CommandBar, FeedView } from "../../ui/src/app/command-bar/command-bar";
import { ReaderToolbar } from "../../ui/src/app/reader-toolbar/reader-toolbar";
import { ClientPrefs } from "../../ui/src/app/client-prefs";
import { Auth } from "../../ui/src/app/auth";
import { ProviderRegistry } from "../../ui/src/app/providers/provider-registry";
import { PrivateFollows } from "../../ui/src/app/private-follows";
import { FeatureFlags } from "../../ui/src/app/feature-flags";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

// Real app components with in-memory service boundaries: no HTTP or storage writes.
function preferences() {
  const feedReader = signal(false);
  const showImages = signal(true);
  const readerFontSize = signal(18);
  const readerFontFamily = signal("serif");
  const readerTheme = signal("app");
  const hidden = signal<string[]>([]);
  return {
    feedReader,
    showImages,
    readerFontSize,
    readerFontFamily,
    readerTheme,
    setFeedReader: (value: boolean) => feedReader.set(value),
    setShowImages: (value: boolean) => showImages.set(value),
    setReaderFontSize: (value: number) =>
      readerFontSize.set(Math.max(15, Math.min(24, value))),
    setReaderFontFamily: (value: string) => readerFontFamily.set(value),
    setReaderTheme: (value: string) => readerTheme.set(value),
    isProviderVisible: (id: string) => !hidden().includes(id),
    toggleProvider: (id: string) =>
      hidden.update((items) =>
        items.includes(id)
          ? items.filter((item) => item !== id)
          : [...items, id],
      ),
  };
}

@Component({
  selector: "mb-toolbar-integration-demo",
  imports: [CommandBar, ReaderToolbar],
  providers: [
    { provide: ClientPrefs, useFactory: preferences },
    {
      provide: Auth,
      useValue: { isAnonymous: false, isBlueskyPrimary: false },
    },
    { provide: PrivateFollows, useValue: { current: () => null } },
    { provide: FeatureFlags, useValue: { enabled: () => false } },
    {
      provide: ProviderRegistry,
      useValue: {
        linked: () => [{ id: "rss", label: "RSS", badge: "📡 RSS" }],
      },
    },
  ],
  template: `
    <article class="ds-sheet">
      <h1>Toolbars in the app</h1>
      <p class="ds-intro">
        These are the production feed command bar and reader controls, using
        in-memory preferences for this preview.
      </p>
      <app-command-bar
        [showRefresh]="true"
        [showFeedViews]="true"
        [showFeedDoctor]="true"
        [providerChips]="true"
        [showReaderControls]="false"
        [view]="view()"
        (viewChange)="view.set($event)"
        (refresh)="refreshes.set(refreshes() + 1)"
      />
      <p role="status">View: {{ view() }} · Refreshes: {{ refreshes() }}</p>
      <h2>Reader controls</h2>
      <app-reader-toolbar />
    </article>
  `,
})
class ToolbarIntegrationDemo {
  readonly view = signal<FeedView>("feed");
  readonly refreshes = signal(0);
}

const meta: Meta<ToolbarIntegrationDemo> = {
  title: "Adoption/Sprint 3 toolbars",
  component: ToolbarIntegrationDemo,
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([], withDisabledInitialNavigation()),
        importProvidersFrom(translocoTesting()),
      ],
    }),
  ],
};
export default meta;
export const AppControls: StoryObj<ToolbarIntegrationDemo> = {};
