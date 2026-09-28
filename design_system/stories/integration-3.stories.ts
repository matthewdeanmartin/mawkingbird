import {
  MbToolbar,
  MbToolbarButton,
} from "../../ui/src/app/design-system/toolbar/toolbar";
import { MbCheckbox } from "../../ui/src/app/design-system/checkbox/checkbox";
import { Component, importProvidersFrom, signal, input } from "@angular/core";
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
  imports: [CommandBar, ReaderToolbar, MbToolbar, MbToolbarButton, MbCheckbox],
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
      <div class="stacked-controls">
        <app-command-bar
          [showFilters]="stacked()"
          [showRefresh]="true"
          [showFeedViews]="true"
          [showFeedDoctor]="true"
          [providerChips]="true"
          [showReaderControls]="false"
          [view]="view()"
          (viewChange)="view.set($event)"
          (refresh)="refreshes.set(refreshes() + 1)"
        >
          @if (stacked()) {
            <mb-toolbar label="Timeline filters" density="compact" embedded>
              <button mbToolbarButton [pressed]="true">Retweets</button>
              <button mbToolbarButton [pressed]="false">Replies</button>
              <button mbToolbarButton [pressed]="false">Calm</button>
            </mb-toolbar>
            <select aria-label="How far back to load">
              <option>Today</option>
              <option>This week</option>
            </select>
            <button type="button">All languages</button>
          }
        </app-command-bar>
        @if (stacked()) {
          <app-reader-toolbar />
        }
      </div>
      <p role="status">View: {{ view() }} · Refreshes: {{ refreshes() }}</p>
      @if (!stacked()) {
        <h2>Reader controls</h2>
        <app-reader-toolbar />
      } @else {
        <h2>Aligned analytics consent</h2>
        <div style="text-align: center; max-width: 380px">
          <mb-checkbox
            name="analytics"
            label="Count my page views"
            hint="Anonymous page counts only — which kinds of page get used, never which account, post or tag you looked at."
            [checked]="analytics()"
            (checkedChange)="analytics.set($event)"
          />
        </div>
      }
    </article>
  `,
})
class ToolbarIntegrationDemo {
  readonly stacked = input(false);
  readonly analytics = signal(true);
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

export const StackedCompact: StoryObj<ToolbarIntegrationDemo> = {
  args: { stacked: true },
};
