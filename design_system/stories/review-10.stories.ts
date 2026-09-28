import { ClientPrefs } from "../../ui/src/app/client-prefs";
import { Streaming } from "../../ui/src/app/streaming";
import {
  Component,
  Injectable,
  OnInit,
  OnDestroy,
  inject,
  importProvidersFrom,
  signal,
} from "@angular/core";
import {
  HttpErrorResponse,
  HttpRequest,
  HttpResponse,
  provideHttpClient,
  withInterceptors,
} from "../../ui/src/app/testing/storybook-http";
import {
  ActivatedRoute,
  Router,
  RouterLink,
  RouterOutlet,
  provideRouter,
  withDisabledInitialNavigation,
  withHashLocation,
} from "@angular/router";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { Observable, of, EMPTY } from "rxjs";
import { PublicTimeline } from "../../ui/src/app/pages/public-timeline/public-timeline";
import { ListTimeline } from "../../ui/src/app/pages/list-timeline/list-timeline";
import { SettingsShell } from "../../ui/src/app/pages/settings/settings-shell";
import { SettingsPreloading } from "../../ui/src/app/pages/settings/settings-preloading";
import { MbPageHeader } from "../../ui/src/app/design-system/page-header/page-header";
import {
  MbToolbar,
  MbToolbarButton,
} from "../../ui/src/app/design-system/toolbar/toolbar";
import {
  MbNavigation,
  MbNavLink,
} from "../../ui/src/app/design-system/navigation/navigation";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";
import { Status } from "../../ui/src/app/models";

// Retain the real preference API/defaults used by these deeply composed pages,
// but let Storybook own theme/accent and keep preference edits in memory.
// The browser tests assert that app construction cannot overwrite catalogue globals.
function previewPreferences(): ClientPrefs {
  const prefs = new ClientPrefs();
  Object.defineProperties(prefs, {
    apply: { value: () => undefined },
    persist: { value: () => undefined },
  });
  return prefs;
}

const title =
  "Research reading list — Wissenschaftskommunikation, internationale Zusammenarbeit und langfristige Perspektiven";
const avatar =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%2346535e'/%3E%3C/svg%3E";
function post(id: string): Status {
  return {
    id,
    created_at: "2026-09-28T12:00:00Z",
    edited_at: null,
    content: `<p>Retained preview post ${id}. Loading another page should leave this post in place.</p>`,
    spoiler_text: "",
    visibility: "public",
    url: null,
    account: {
      id: "preview-author",
      username: "reader",
      acct: "reader",
      display_name: "A reader with a long display name",
      avatar,
      avatar_static: avatar,
      emojis: [],
      fields: [],
    } as unknown as Status["account"],
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
    emojis: [],
  } as Status;
}
@Injectable()
class NavigationReviewState {
  readonly pending = signal<
    { url: string; complete: (mode: string) => void }[]
  >([]);
  readonly lastRequest = signal("No timeline request yet.");
  respond(request: HttpRequest<unknown>): Observable<HttpResponse<unknown>> {
    if (request.url.includes("/timelines/")) {
      this.lastRequest.set(request.urlWithParams);
      return new Observable((observer) => {
        const entry = {
          url: request.urlWithParams,
          complete: (mode: string) => {
            if (mode === "fail")
              observer.error(
                new HttpErrorResponse({
                  status: 503,
                  statusText: "Preview unavailable",
                }),
              );
            else {
              const list = request.url.includes("/list/");
              const append = request.params.has("max_id");
              const body =
                mode === "empty"
                  ? []
                  : Array.from({ length: list && !append ? 40 : 2 }, (_, i) =>
                      post(String((append ? 60 : 100) - i)),
                    );
              observer.next(new HttpResponse({ status: 200, body }));
              observer.complete();
            }
          },
        };
        this.pending.update((entries) => [...entries, entry]);
        return () =>
          this.pending.update((entries) =>
            entries.filter((item) => item !== entry),
          );
      });
    }
    const body = /\/lists\/review$/.test(request.url)
      ? { id: "review", title }
      : [];
    return of(new HttpResponse({ status: 200, body }));
  }
  finish(mode: string): void {
    for (const entry of this.pending()) entry.complete(mode);
  }
}
@Component({
  imports: [MbPageHeader],
  template: `<mb-page-header [title]="title()" />
    <p class="ds-section">
      Preview destination content. The navigation around it is the real Settings
      shell.
    </p>`,
})
class SettingsDestination implements OnDestroy {
  readonly title = signal("");
  private readonly subscription = inject(ActivatedRoute).url.subscribe(
    (segments) =>
      this.title.set(
        `Settings destination: ${segments.map((segment) => segment.path).join("/")}`,
      ),
  );
  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }
}

@Component({
  selector: "ds-navigation-adoption-review",
  imports: [
    RouterOutlet,
    RouterLink,
    MbToolbar,
    MbToolbarButton,
    MbNavigation,
    MbNavLink,
  ],
  template: `<article class="ds-sheet">
    <h1>Navigation and timeline states in real pages.</h1>
    <p class="ds-intro">
      Sprint 10 · Native settings links, list headers and timeline feedback
      reuse approved widgets.
    </p>
    <nav mbNavigation label="Review pages" presentation="tabs">
      <a mbNavLink routerLink="/public">Public timeline</a>
      <a mbNavLink routerLink="/lists/review">List timeline</a>
      <a
        mbNavLink
        routerLink="/settings/writing"
        [queryParams]="{ review: 'morning' }"
        >Settings navigation</a
      >
    </nav>
    <p>
      Local responses are held so you can inspect loading. Choose a result
      below. Refresh or Load more, then fail the request to check that posts
      stay put. Retry uses the same cursor.
    </p>
    <mb-toolbar label="Preview responses" density="compact">
      <button
        mbToolbarButton
        [disabled]="!state.pending().length"
        (click)="state.finish('posts')"
      >
        Return posts
      </button>
      <button
        mbToolbarButton
        [disabled]="!state.pending().length"
        (click)="state.finish('empty')"
      >
        Return empty
      </button>
      <button
        mbToolbarButton
        [disabled]="!state.pending().length"
        (click)="state.finish('fail')"
      >
        Fail request
      </button>
    </mb-toolbar>
    <p>
      Last timeline request: <output>{{ state.lastRequest() }}</output>
    </p>
    <section aria-label="App page"><router-outlet /></section>
  </article>`,
})
class NavigationAdoptionReview implements OnInit {
  readonly state = inject(NavigationReviewState);
  private readonly router = inject(Router);
  ngOnInit(): void {
    void this.router.navigateByUrl("/public");
  }
}
const meta: Meta<NavigationAdoptionReview> = {
  title: "Start here/Sprint 10 review",
  component: NavigationAdoptionReview,
  decorators: [
    applicationConfig({
      providers: [
        NavigationReviewState,
        { provide: ClientPrefs, useFactory: previewPreferences },
        { provide: Streaming, useValue: { open: () => EMPTY } },
        importProvidersFrom(translocoTesting()),
        provideHttpClient(
          withInterceptors([
            (request) => inject(NavigationReviewState).respond(request),
          ]),
        ),
        { provide: SettingsPreloading, useValue: { enable: () => undefined } },
        provideRouter(
          [
            { path: "public", component: PublicTimeline },
            { path: "lists/:id", component: ListTimeline },
            {
              path: "settings",
              component: SettingsShell,
              children: [{ path: "**", component: SettingsDestination }],
            },
          ],
          withHashLocation(),
          withDisabledInitialNavigation(),
        ),
      ],
    }),
  ],
};
export default meta;
export const AppPages: StoryObj<NavigationAdoptionReview> = {};
