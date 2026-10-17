import { Component, inject, importProvidersFrom, signal } from "@angular/core";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import {
  provideRouter,
  withDisabledInitialNavigation,
  withHashLocation,
} from "@angular/router";
import { of } from "rxjs";
import {
  provideHttpClient,
  withInterceptors,
  HttpResponse,
} from "../../ui/src/app/testing/storybook-http";
import { VideosPage } from "../../ui/src/app/pages/videos/videos-page";
import { VideoSubscriptions } from "../../ui/src/app/providers/videos/video-subscriptions";
import { YoutubeFeeds } from "../../ui/src/app/providers/videos/youtube-feeds";
import { parseFeed } from "../../ui/src/app/providers/rss/rss-parser";
import { Auth } from "../../ui/src/app/auth";
import { ClientPrefs } from "../../ui/src/app/client-prefs";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";
const channels = [
  {
    id: "UCy0tKL1T7wFoYcxCe0xjN6Q",
    title: "Technology Connections",
    enabled: true,
  },
];
@Component({
  selector: "ds-video-feeds-review",
  imports: [VideosPage],
  template: `<app-videos-page />`,
})
class VideoFeedsReview {
  constructor() {
    const auth = inject(Auth);
    auth.kind.set("mastodon");
    auth.token.set("preview-only-not-a-credential");
  }
}
export default {
  title: "Start here/Video feeds",
  component: VideoFeedsReview,
  decorators: [
    applicationConfig({
      providers: [
        importProvidersFrom(translocoTesting()),
        provideRouter(
          [{ path: "videos", component: VideosPage }],
          withDisabledInitialNavigation(),
          withHashLocation(),
        ),
        provideHttpClient(
          withInterceptors([
            (request) =>
              of(
                new HttpResponse({
                  status: 200,
                  body: request.url.includes("instance")
                    ? { configuration: { statuses: { max_characters: 500 } } }
                    : [],
                }),
              ),
          ]),
        ),
        {
          provide: ClientPrefs,
          useFactory: () => {
            const prefs = new ClientPrefs();
            Object.defineProperty(prefs, "apply", { value: () => undefined });
            Object.defineProperty(prefs, "persist", { value: () => undefined });
            return prefs;
          },
        },
        {
          provide: VideoSubscriptions,
          useFactory: () => ({
            feeds: signal(channels),
            enabled: signal(channels),
            has: () => true,
            add: () => undefined,
            remove: () => undefined,
            setEnabled: () => undefined,
          }),
        },
        {
          provide: YoutubeFeeds,
          useValue: {
            feed: async () =>
              parseFeed(
                `<feed xmlns="http://www.w3.org/2005/Atom"><title>Technology Connections</title><entry><id>older</id><title>How lamps work</title><link href="https://youtube.com/watch?v=0KoeY54M5VA"/><published>2026-01-01T10:00:00Z</published></entry><entry><id>newer</id><title>Why switches click</title><link href="https://youtube.com/watch?v=uMhdcq2rqUU"/><published>2026-01-02T10:00:00Z</published></entry></feed>`,
              ),
          },
        },
      ],
    }),
  ],
} satisfies Meta<VideoFeedsReview>;
export const Subscriptions: StoryObj<VideoFeedsReview> = {};
