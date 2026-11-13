import {
  Component,
  importProvidersFrom,
  inject,
  OnInit,
  signal,
} from "@angular/core";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import {
  ActivatedRoute,
  provideRouter,
  RouteReuseStrategy,
  Router,
  RouterLink,
  RouterOutlet,
  withDisabledInitialNavigation,
  withHashLocation,
} from "@angular/router";
import { ReadingHistory } from "../../ui/src/app/shell/reading-history";
import { ReadingOutlet } from "../../ui/src/app/shell/reading-outlet";
import { ReadingBack } from "../../ui/src/app/shell/reading-back";
import { MbButton } from "../../ui/src/app/design-system/button/button";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

/** Deterministic paged data; the router, retention and Back controls are production code. */
@Component({
  imports: [RouterLink, MbButton, ReadingBack],
  template: `
    @if (detail) {
      <app-reading-back />
    }
    <h1>{{ detail ? "Discussion " + detail : "Reading history feed" }}</h1>
    <label
      >Filter
      <input
        aria-label="Filter"
        [value]="filter()"
        (input)="filter.set($any($event.target).value)"
    /></label>
    <p role="status">{{ count() }} loaded posts</p>
    @for (post of posts(); track post) {
      <article [attr.data-post]="post">
        <h2>Post {{ post }}</h2>
        <p>A stable reading row with room for text and media.</p>
        <a [routerLink]="['/statuses', detail ? 'nested' : post]"
          >Open discussion {{ post }}</a
        >
        <a routerLink="/accounts/alice">View profile</a>
      </article>
    }
    <button mbButton type="button" (click)="more()">Load more</button>
  `,
  styles: `
    article {
      min-height: 180px;
      padding: 16px;
      border-bottom: 1px solid var(--border);
    }
    article a {
      display: inline-block;
      margin-inline-end: 1rem;
    }
    h1,
    label,
    p[role="status"] {
      margin-inline: 16px;
    }
  `,
})
class ReadingFixture {
  readonly detail = inject(ActivatedRoute).snapshot.paramMap.get("id");
  readonly count = signal(10);
  readonly filter = signal("");
  readonly posts = signal(Array.from({ length: 10 }, (_, i) => i));
  more(): void {
    this.count.update((count) => count + 10);
    this.posts.set(Array.from({ length: this.count() }, (_, i) => i));
  }
}

@Component({
  imports: [RouterOutlet, ReadingOutlet],
  template: `<main id="main"><router-outlet mbReadingOutlet /></main>`,
  styles: `
    main {
      max-width: 700px;
      margin: auto;
    }
  `,
})
class ReadingHistoryReview implements OnInit {
  private router = inject(Router);
  private history = inject(ReadingHistory);
  ngOnInit(): void {
    this.history.start(this.router);
    this.history.setScope("preview");
    this.router.setUpLocationChangeListener();
    void this.router.navigateByUrl("/home", { replaceUrl: true });
  }
}

export default {
  title: "Navigation/Reading history",
  component: ReadingHistoryReview,
  decorators: [
    applicationConfig({
      providers: [
        importProvidersFrom(translocoTesting()),
        { provide: RouteReuseStrategy, useExisting: ReadingHistory },
        provideRouter(
          [
            { path: "home", component: ReadingFixture },
            { path: "statuses/:id", component: ReadingFixture },
            { path: "accounts/:id", component: ReadingFixture },
          ],
          withHashLocation(),
          withDisabledInitialNavigation(),
        ),
      ],
    }),
  ],
} satisfies Meta<ReadingHistoryReview>;
export const NestedReading: StoryObj<ReadingHistoryReview> = {};
