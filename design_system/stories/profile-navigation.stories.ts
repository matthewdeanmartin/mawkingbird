import {
  Component,
  inject,
  importProvidersFrom,
  input,
  OnInit,
  ViewChild,
} from "@angular/core";
import {
  provideHttpClient,
  withInterceptors,
  HttpResponse,
} from "../../ui/src/app/testing/storybook-http";
import { provideRouter, withDisabledInitialNavigation } from "@angular/router";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { of } from "rxjs";
import { Profile } from "../../ui/src/app/accounts/profile/profile";
import { Auth } from "../../ui/src/app/platform/session/auth";
import { Account } from "../../ui/src/app/platform/api/models";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

@Component({
  imports: [Profile],
  template: `<div class="profile-layout">
    <nav aria-label="App navigation">Home · Search · Feeds</nav>
    <app-profile />
  </div>`,
  styles: `
    .profile-layout {
      max-width: 600px;
      margin: auto;
      border: 1px solid var(--border);
    }
    nav {
      padding: 16px;
      background: var(--col-bg);
    }
  `,
})
class ProfileNavigationReview implements OnInit {
  readonly platform = input("mastodon");
  @ViewChild(Profile, { static: true }) profile!: Profile;
  private auth = inject(Auth);
  constructor() {
    this.auth.setToken("profile-layout-preview");
  }
  ngOnInit(): void {
    const account = {
      id: "profile-layout",
      username: "reader",
      acct: "reader@example.social",
      display_name: "A reader's profile",
      url: "https://example.social/@reader",
      avatar: "/favicon-32x32.png",
      avatar_static: "/favicon-32x32.png",
      header: "",
      header_static: "",
      note: "<p>A profile with its banner directly below the app navigation.</p>",
      statuses_count: 1850,
      following_count: 123,
      followers_count: 5617,
      fields: [],
      emojis: [],
      locked: false,
      bot: false,
    } as Account;
    if (this.platform() === "self") this.auth.account.set(account);
    else if (this.platform() === "openrouter") account.id = "openrouter:self";
    this.profile["account"].set(account);
    this.profile["loading"].set(false);
    this.profile["statusesLoading"].set(false);
    for (const [platform, flag] of [
      ["bluesky", "isBluesky"],
      ["misskey", "isMisskey"],
      ["rss", "isRss"],
      ["twitter", "isTwitter"],
    ] as const) {
      this.profile[flag].set(this.platform() === platform);
    }
  }
}

export default {
  title: "Navigation/Profile Back",
  component: ProfileNavigationReview,
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([], withDisabledInitialNavigation()),
        provideHttpClient(
          withInterceptors([() => of(new HttpResponse({ body: [] }))]),
        ),
        importProvidersFrom(translocoTesting()),
      ],
    }),
  ],
} satisfies Meta<ProfileNavigationReview>;
export const Mastodon: StoryObj<ProfileNavigationReview> = {
  args: { platform: "mastodon" },
};
export const Bluesky: StoryObj<ProfileNavigationReview> = {
  args: { platform: "bluesky" },
};
export const Misskey: StoryObj<ProfileNavigationReview> = {
  args: { platform: "misskey" },
};
export const Rss: StoryObj<ProfileNavigationReview> = {
  args: { platform: "rss" },
};
export const Twitter: StoryObj<ProfileNavigationReview> = {
  args: { platform: "twitter" },
};
export const Self: StoryObj<ProfileNavigationReview> = {
  args: { platform: "self" },
};
export const Openrouter: StoryObj<ProfileNavigationReview> = {
  args: { platform: "openrouter" },
};
