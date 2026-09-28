import {
  Component,
  Injectable,
  inject,
  signal,
  importProvidersFrom,
} from "@angular/core";
import {
  provideRouter,
  RouterOutlet,
  ActivatedRoute,
  withHashLocation,
  withDisabledInitialNavigation,
} from "@angular/router";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { Observable } from "rxjs";
import { Api } from "../../ui/src/app/api";
import { Auth } from "../../ui/src/app/auth";
import { Terminology } from "../../ui/src/app/terminology";
import { AnonymousPublicApi } from "../../ui/src/app/providers/anonymous/anonymous-public-api";
import { AccountListDialog } from "../../ui/src/app/account-list-dialog/account-list-dialog";
import { HistoryDialog } from "../../ui/src/app/history-dialog/history-dialog";
import { SignInPrompt } from "../../ui/src/app/sign-in-prompt/sign-in-prompt";
import { MbDialog } from "../../ui/src/app/design-system/dialog/dialog";
import { MbButton } from "../../ui/src/app/design-system/button/button";
import {
  MbToolbar,
  MbToolbarButton,
} from "../../ui/src/app/design-system/toolbar/toolbar";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";
const avatar =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%2346535e'/%3E%3C/svg%3E";
@Injectable()
class ReadResponses {
  readonly mode = signal("Rows");
  readonly pending = signal(0);
  readonly cancelled = signal(0);
  readonly exits = signal(0);
  readonly dialog = signal("");
  readonly parent = signal(false);
  read(history = false): Observable<unknown[]> {
    const mode = this.mode();
    if (mode === "Fail once") this.mode.set("Rows");
    return new Observable((observer) => {
      this.pending.update((n) => n + 1);
      let finished = false;
      const timer =
        mode === "Hold"
          ? undefined
          : setTimeout(() => {
              finished = true;
              if (mode === "Fail once")
                observer.error(new Error("Preview failed"));
              else {
                const body =
                  mode === "Empty"
                    ? []
                    : Array.from({ length: 18 }, (_, i) =>
                        history
                          ? {
                              content: `<p>Revision ${i + 1}. A long history entry with <strong>formatted text</strong> and a <a href='#history-link'>native link</a>. ${"Long prose survives narrow screens. ".repeat(4)}</p>`,
                              spoiler_text:
                                i === 0 ? "Earlier content warning" : "",
                              created_at: "2026-09-28T12:00:00Z",
                            }
                          : {
                              id: String(i + 1),
                              username: "reader",
                              acct: `reader-${i + 1}@very-long-community-name.example`,
                              display_name: `Reader ${i + 1} — internationale Zusammenarbeit und Wissenschaftskommunikation`,
                              avatar,
                              avatar_static: avatar,
                            },
                      );
                observer.next(body);
                observer.complete();
              }
            }, 500);
      return () => {
        clearTimeout(timer);
        this.pending.update((n) => n - 1);
        if (!finished) this.cancelled.update((n) => n + 1);
      };
    });
  }
}
@Component({
  template: `<p>
    Local preview destination: {{ route.snapshot.url.join("/") }}
  </p>`,
})
class Destination {
  readonly route = inject(ActivatedRoute);
}
@Component({
  selector: "ds-post-dialog-review",
  imports: [
    AccountListDialog,
    HistoryDialog,
    SignInPrompt,
    MbDialog,
    MbButton,
    MbToolbar,
    MbToolbarButton,
    RouterOutlet,
  ],
  template: `<article class="ds-sheet">
    <h1>Post dialogs, one shared shell.</h1>
    <p class="ds-intro">
      Sprint 12 · Real account lists, history and sign-in prompts. Long content,
      failed reads and nested focus.
    </p>
    <p>
      Choose the next response before opening a dialog. Fail once recovers on
      Retry; Hold stays loading until you close it. All responses are local.
    </p>
    <mb-toolbar label="Next read response" density="compact">
      @for (mode of modes; track mode) {
        <button
          mbToolbarButton
          [pressed]="state.mode() === mode"
          (click)="state.mode.set(mode)"
        >
          {{ mode }}
        </button>
      }
    </mb-toolbar>
    <mb-toolbar label="Open post dialog" density="compact">
      <button mbToolbarButton (click)="state.dialog.set('likes')">
        Liked by
      </button>
      <button mbToolbarButton (click)="state.dialog.set('boosts')">
        Boosted by
      </button>
      <button mbToolbarButton (click)="state.dialog.set('history')">
        Edit history
      </button>
      <button mbToolbarButton (click)="state.dialog.set('anonymous-history')">
        Public edit history
      </button>
      <button mbToolbarButton (click)="state.dialog.set('sign-in')">
        Sign-in prompt
      </button>
      <button mbToolbarButton (click)="state.parent.set(true)">
        Nested post dialogs
      </button>
    </mb-toolbar>
    <p>
      Pending reads: <output data-pending>{{ state.pending() }}</output
      >. Cancelled reads: <output data-cancelled>{{ state.cancelled() }}</output
      >. Preview account exits: <output data-exits>{{ state.exits() }}</output
      >.
    </p>
    <router-outlet />
    @if (state.parent()) {
      <mb-dialog
        title="Parent post tools"
        closeLabel="Close parent"
        [closeOnBackdrop]="true"
        (dismissed)="state.parent.set(false)"
      >
        <p>
          Closing the child should return here and keep the parent scroll lock.
        </p>
        <button mbButton (click)="state.dialog.set('history')">
          Open child history
        </button>
      </mb-dialog>
    }
    @if (state.dialog() === "likes" || state.dialog() === "boosts") {
      <app-account-list-dialog
        statusId="preview"
        [mode]="state.dialog() === 'likes' ? 'favourited_by' : 'reblogged_by'"
        (closed)="state.dialog.set('')"
      />
    }
    @if (
      state.dialog() === "history" || state.dialog() === "anonymous-history"
    ) {
      <app-history-dialog
        statusId="preview"
        [server]="
          state.dialog() === 'anonymous-history'
            ? 'https://origin.example'
            : null
        "
        (closed)="state.dialog.set('')"
      />
    }
    @if (state.dialog() === "sign-in") {
      <app-sign-in-prompt
        action="like this"
        (dismissed)="state.dialog.set('')"
      />
    }
  </article>`,
})
class PostDialogReview {
  readonly state = inject(ReadResponses);
  readonly modes = ["Rows", "Empty", "Fail once", "Hold"];
}
export default {
  title: "Start here/Sprint 12 review",
  component: PostDialogReview,
  decorators: [
    applicationConfig({
      providers: [
        ReadResponses,
        importProvidersFrom(translocoTesting()),
        {
          provide: Api,
          useFactory: () => {
            const state = inject(ReadResponses);
            return {
              favouritedBy: () => state.read(),
              rebloggedBy: () => state.read(),
              statusHistory: () => state.read(true),
            };
          },
        },
        {
          provide: AnonymousPublicApi,
          useFactory: () => {
            const state = inject(ReadResponses);
            return { getStatusHistory: () => state.read(true) };
          },
        },
        {
          provide: Auth,
          useFactory: () => {
            const state = inject(ReadResponses);
            return {
              exitAnonymous: () => {
                state.exits.update((n) => n + 1);
                state.dialog.set("");
              },
            };
          },
        },
        {
          provide: Terminology,
          useValue: { words: () => ({ BoostedBy: "Boosted by" }) },
        },
        provideRouter(
          [{ path: "**", component: Destination }],
          withHashLocation(),
          withDisabledInitialNavigation(),
        ),
      ],
    }),
  ],
} satisfies Meta<PostDialogReview>;
export const ReadAndRecover: StoryObj<PostDialogReview> = {};
