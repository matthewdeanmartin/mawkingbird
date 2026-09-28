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
import { Observable } from "rxjs";
import { Api } from "../../ui/src/app/api";
import { BlueskyApi } from "../../ui/src/app/providers/bluesky/bluesky-api";
import { BskyRef } from "../../ui/src/app/providers/bluesky/bluesky-types";
import { ReportDialog } from "../../ui/src/app/report-dialog/report-dialog";
import { BookmarkProviderDialog } from "../../ui/src/app/bookmark-provider-dialog/bookmark-provider-dialog";
import {
  MbToolbar,
  MbToolbarButton,
} from "../../ui/src/app/design-system/toolbar/toolbar";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";
@Injectable()
class Responses {
  readonly outcome = signal("Fail once");
  readonly requests = signal(0);
  readonly pending = signal<{ finish: () => void }[]>([]);
  readonly last = signal("");
  readonly result = signal("No action taken.");
  send(destination: string, args: unknown[]) {
    const mode = this.outcome();
    if (mode === "Fail once") this.outcome.set("Success");
    this.requests.update((n) => n + 1);
    this.last.set(JSON.stringify({ destination, args }));
    return new Observable((observer) => {
      const entry = {
        finish: () => {
          observer.next({});
          observer.complete();
        },
      };
      this.pending.update((entries) => [...entries, entry]);
      const timer =
        mode === "Hold"
          ? undefined
          : setTimeout(() => {
              if (mode === "Fail once")
                observer.error(new Error("Preview failure"));
              else entry.finish();
            }, 500);
      return () => {
        clearTimeout(timer);
        this.pending.update((entries) =>
          entries.filter((item) => item !== entry),
        );
      };
    });
  }
  release() {
    for (const entry of this.pending()) entry.finish();
  }
}
@Component({
  selector: "ds-choice-report-review",
  styles: ["[data-request] { overflow-wrap: anywhere; }"],
  imports: [ReportDialog, BookmarkProviderDialog, MbToolbar, MbToolbarButton],
  template: `<article class="ds-sheet">
    <h1>Bookmark choices and report forms.</h1>
    <p class="ds-intro">
      Sprint 13 · Real dialogs with local services. No bookmark is written and
      no report is sent to a provider.
    </p>
    <mb-toolbar label="Bookmark previews" density="compact">
      <button mbToolbarButton (click)="bookmark.set('normal')">
        Bookmark destinations
      </button>
      <button mbToolbarButton (click)="bookmark.set('saved')">
        Saved browser bookmark
      </button>
      <button mbToolbarButton (click)="bookmark.set('no-link')">
        No external link
      </button>
    </mb-toolbar>
    <p>
      Choose a report response before opening the form. Fail once retains your
      fields and succeeds on retry. Hold demonstrates pending dismissal; closing
      the form does not cancel a report already started.
    </p>
    <mb-toolbar label="Report response" density="compact">
      @for (mode of modes; track mode) {
        <button
          mbToolbarButton
          [pressed]="state.outcome() === mode"
          (click)="state.outcome.set(mode)"
        >
          {{ mode }}
        </button>
      }
      <button
        mbToolbarButton
        [disabled]="!state.pending().length"
        (click)="state.release()"
      >
        Complete held reports
      </button>
    </mb-toolbar>
    <mb-toolbar label="Report previews" density="compact">
      <button mbToolbarButton (click)="report.set('mastodon')">
        Mastodon post report
      </button>
      <button mbToolbarButton (click)="report.set('bluesky-post')">
        Bluesky post report
      </button>
      <button mbToolbarButton (click)="report.set('bluesky-account')">
        Bluesky account report
      </button>
      <button mbToolbarButton (click)="report.set('invalid')">
        Missing post reference
      </button>
    </mb-toolbar>
    <p>
      Result: <output data-result>{{ state.result() }}</output>
    </p>
    <p>
      Report calls: <output data-requests>{{ state.requests() }}</output
      >. Pending: <output data-pending>{{ state.pending().length }}</output
      >.
    </p>
    <p>
      Last local request: <output data-request>{{ state.last() }}</output>
    </p>
    @if (bookmark()) {
      <app-bookmark-provider-dialog
        [anonymous]="bookmark() === 'saved'"
        [nativeBookmarked]="bookmark() === 'saved'"
        [externalUrl]="bookmark() === 'no-link' ? null : external"
        (closed)="bookmark.set('')"
        (chosen)="state.result.set($event); bookmark.set('')"
      />
    }
    @if (report()) {
      <app-report-dialog
        username="a-long-account-name@an-international-community.example"
        [provider]="report() === 'mastodon' ? 'mastodon' : 'bluesky'"
        [accountId]="report() === 'mastodon' ? '42' : 'bsky:did:plc:preview'"
        [statusId]="report() === 'bluesky-account' ? undefined : 'preview-post'"
        [statusRef]="report() === 'bluesky-post' ? ref : null"
        (closed)="report.set('')"
        (submitted)="
          state.result.set('Simulated report completed'); report.set('')
        "
      />
    }
  </article>`,
})
class ChoiceReportReview {
  readonly state = inject(Responses);
  readonly bookmark = signal("");
  readonly report = signal("");
  readonly modes = ["Fail once", "Success", "Hold"];
  readonly external =
    "https://very-long-international-community-name.example/article";
  readonly ref = {
    uri: "at://did:plc:preview/app.bsky.feed.post/exact",
    cid: "exact-cid",
    likeUri: null,
    repostUri: null,
    replyRoot: {
      uri: "at://did:plc:preview/app.bsky.feed.post/exact",
      cid: "exact-cid",
    },
    replyParentUri: null,
    externalUri: null,
  } satisfies BskyRef;
}
export default {
  title: "Start here/Sprint 13 review",
  component: ChoiceReportReview,
  decorators: [
    applicationConfig({
      providers: [
        Responses,
        importProvidersFrom(translocoTesting()),
        {
          provide: Api,
          useFactory: () => {
            const s = inject(Responses);
            return { report: (...args: unknown[]) => s.send("Mastodon", args) };
          },
        },
        {
          provide: BlueskyApi,
          useFactory: () => {
            const s = inject(Responses);
            return {
              reportPost: (...args: unknown[]) => s.send("Bluesky post", args),
              reportAccount: (...args: unknown[]) =>
                s.send("Bluesky account", args),
            };
          },
        },
      ],
    }),
  ],
} satisfies Meta<ChoiceReportReview>;
export const ChooseAndReport: StoryObj<ChoiceReportReview> = {};
