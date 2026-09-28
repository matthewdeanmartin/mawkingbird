import {
  Component,
  Injectable,
  inject,
  signal,
  importProvidersFrom,
} from "@angular/core";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { provideRouter, withDisabledInitialNavigation } from "@angular/router";
import { RssFeedActions } from "../../ui/src/app/pages/rss/feed-actions/feed-actions";
import { RssSubscriptions } from "../../ui/src/app/providers/rss/rss-subscriptions";
import { PollResults } from "../../ui/src/app/poll-results/poll-results";
import { Poll, Status } from "../../ui/src/app/models";
import {
  MbToolbar,
  MbToolbarButton,
} from "../../ui/src/app/design-system/toolbar/toolbar";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";
const feedUrl = "https://example.test/feed?topic=long-form&lang=en";
const title =
  "Notes from an international community of independent readers and writers";
@Injectable()
class FeedPreview {
  readonly subscribed = signal(true);
  readonly removed = signal<string[]>([]);
  readonly feeds = () => (this.subscribed() ? [{ url: feedUrl, title }] : []);
  has(url: string) {
    return url === feedUrl && this.subscribed();
  }
  remove(url: string) {
    this.removed.update((v) => [...v, url]);
    this.subscribed.set(false);
  }
}
@Component({
  selector: "ds-review-sixteen",
  imports: [RssFeedActions, PollResults, MbToolbar, MbToolbarButton],
  template: `
    <h1>Feed actions and poll disclosure.</h1>
    <p>
      Real app components with in-memory subscriptions. Frequent post actions
      stay visible in the app. Only confirmed unsubscribe changes this fixture;
      no accounts, storage or feeds are changed.
    </p>
    <mb-toolbar label="Preview scenarios">
      @for (mode of modes; track mode) {
        <button
          mbToolbarButton
          type="button"
          [pressed]="scenario() === mode"
          (click)="scenario.set(mode)"
        >
          {{ mode }}
        </button>
      }
      <button
        mbToolbarButton
        type="button"
        (click)="feed.subscribed.set(true); feed.removed.set([])"
      >
        Reset subscription
      </button>
    </mb-toolbar>
    <section aria-label="Feed controls">
      <h2>{{ title }}</h2>
      <p>
        The same feed control is used beside an RSS headline and below a full
        article.
      </p>
      <app-rss-feed-actions
        [status]="status"
        (unsubscribed)="emitted.set($event)"
      />
      <p data-subscription>
        {{ feed.subscribed() ? "Subscribed" : "Unsubscribed" }}
      </p>
      <output data-removed>{{ feed.removed().join(" | ") }}</output>
      <output data-emitted>{{ emitted() }}</output>
    </section>
    <section aria-label="Poll results">
      <h2>A post with a poll</h2>
      <app-poll-results
        [poll]="poll()"
        [visible]="scenario() !== 'Hidden results'"
      />
    </section>
  `,
  styles: `
    section {
      margin-block: 24px;
      max-inline-size: 42rem;
    }
    output {
      display: block;
      overflow-wrap: anywhere;
    }
  `,
})
class PostDetailsReview {
  readonly feed = inject(FeedPreview);
  readonly title = title;
  readonly emitted = signal("");
  readonly modes = [
    "Single choice",
    "Multiple choice",
    "Missing counts",
    "Hidden results",
  ];
  readonly scenario = signal("Single choice");
  readonly status = {
    provider: "rss",
    account: { id: "rss:" + feedUrl, display_name: title },
  } as Status;
  poll(): Poll {
    const missing = this.scenario() === "Missing counts";
    return {
      id: "review-poll",
      expires_at: null,
      expired: true,
      multiple: this.scenario() === "Multiple choice",
      votes_count: 2000,
      voters_count: this.scenario() === "Multiple choice" ? 1500 : 2000,
      voted: true,
      own_votes: [1],
      options: [
        {
          title:
            "Keep all frequently used post tools visible, including large counts",
          votes_count: missing ? NaN : 1200,
        },
        {
          title:
            "Keep statistics available in a labelled disclosure beneath the results",
          votes_count: 800,
        },
      ],
    };
  }
}
export default {
  title: "Start here/Sprint 16 review",
  component: PostDetailsReview,
  decorators: [
    applicationConfig({
      providers: [
        FeedPreview,
        { provide: RssSubscriptions, useExisting: FeedPreview },
        provideRouter([], withDisabledInitialNavigation()),
        importProvidersFrom(translocoTesting()),
      ],
    }),
  ],
} satisfies Meta<PostDetailsReview>;
export const FeedActionsAndPolls: StoryObj<PostDetailsReview> = {};
