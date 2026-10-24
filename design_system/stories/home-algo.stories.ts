import { Component, importProvidersFrom, signal } from "@angular/core";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { SettingsHomeAlgo } from "../../ui/src/app/pages/settings/home-algo/settings-home-algo";
import {
  HomeAlgoSettings,
  HOME_FACTORY,
} from "../../ui/src/app/home-algo-settings";
import { HomeDefaults } from "../../ui/src/app/home-defaults";
import { HomeFeedCatalog } from "../../ui/src/app/home-feed-catalog";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

@Component({
  selector: "ds-home-algo-review",
  imports: [SettingsHomeAlgo],
  template: "<main><app-settings-home-algo /></main>",
  styles: [
    "main { max-width: 850px; margin: 16px auto; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }",
  ],
})
class HomeAlgoPreview {}
export default {
  title: "Adoption/Home and Algo",
  component: HomeAlgoPreview,
  decorators: [
    applicationConfig({
      providers: [
        importProvidersFrom(translocoTesting()),
        {
          provide: HomeAlgoSettings,
          useFactory: () => ({ value: signal(HOME_FACTORY), save: () => true }),
        },
        {
          provide: HomeDefaults,
          useFactory: () => ({ value: signal("all"), set: () => true }),
        },
        {
          provide: HomeFeedCatalog,
          useValue: {
            choices: async () => [
              { type: "tags", id: "cats", label: "#cats" },
              { type: "tags", id: "sciencefiction", label: "#sciencefiction" },
            ],
          },
        },
      ],
    }),
  ],
} satisfies Meta<HomeAlgoPreview>;
export const Settings: StoryObj<HomeAlgoPreview> = {};
