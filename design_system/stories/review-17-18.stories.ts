import {
  Component,
  Injectable,
  inject,
  signal,
  importProvidersFrom,
} from "@angular/core";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  withDisabledInitialNavigation,
} from "@angular/router";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { of, Subject } from "rxjs";
import { ClientListPage } from "../../ui/src/app/pages/client-list/client-list-page";
import { ClientLists } from "../../ui/src/app/lists/client-lists";
import { ProfileLists } from "../../ui/src/app/providers/account/profile-lists";
import { ListFeedResolver } from "../../ui/src/app/lists/list-feed-resolver";
import { PageDiagnostics } from "../../ui/src/app/page-diagnostics";
import { Account } from "../../ui/src/app/models";
import { HistoryDialog } from "../../ui/src/app/history-dialog/history-dialog";
import { Api } from "../../ui/src/app/api";
import { AnonymousPublicApi } from "../../ui/src/app/providers/anonymous/anonymous-public-api";
import {
  MbToolbar,
  MbToolbarButton,
} from "../../ui/src/app/design-system/toolbar/toolbar";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";
const accounts = [
  {
    id: "reader-one",
    username: "reader",
    display_name:
      "A very long international display name — collaboration across communities",
    acct: "a-long-account-handle@a-very-long-community-domain.example",
  },
  {
    id: "reader-two",
    username: "another",
    display_name: "Another reader",
    acct: "another@example.test",
  },
] as Account[];
@Injectable()
class ListPreview {
  readonly mode = signal("Members");
  readonly reads = signal(0);
  pending = new Subject<Account[]>();
  get() {
    return this.mode() === "Missing list"
      ? null
      : {
          id: "local",
          title: "Readers from many communities — a long collection name",
          memberHandles:
            this.mode() === "Empty list" ? [] : accounts.map((a) => a.acct),
        };
  }
  resolve() {
    this.reads.update((v) => v + 1);
    return this.mode() === "Loading" ? this.pending : of(accounts);
  }
}
@Component({
  selector: "ds-review-final",
  imports: [ClientListPage, HistoryDialog, MbToolbar, MbToolbarButton],
  template: `
    <h1>Final batch: local panels and readable identities.</h1>
    <p>
      Real client-list and edit-history components with isolated reads.
      Switching tabs does not fetch again. No accounts or storage are changed.
    </p>
    <mb-toolbar label="Preview scenarios">
      @for (mode of modes; track mode) {
        <button
          mbToolbarButton
          type="button"
          [pressed]="state.mode() === mode"
          (click)="setMode(mode)"
        >
          {{ mode }}
        </button>
      }
      <button mbToolbarButton type="button" (click)="release()">
        Finish loading
      </button>
      <button mbToolbarButton type="button" (click)="history.set(true)">
        Edit history
      </button>
    </mb-toolbar>
    <output data-reads>Member reads: {{ state.reads() }}</output>
    <section aria-label="Client list preview">
      @for (mode of [state.mode()]; track mode) {
        <app-client-list-page />
      }
    </section>
    @if (history()) {
      <app-history-dialog
        statusId="preview-post"
        (closed)="history.set(false)"
      />
    }
  `,
  styles: `
    section {
      max-inline-size: 48rem;
      margin-block: 16px;
    }
    output {
      display: block;
      margin-block: 12px;
    }
  `,
})
class FinalBatchReview {
  readonly state = inject(ListPreview);
  readonly history = signal(false);
  readonly modes = ["Members", "Empty list", "Missing list", "Loading"];
  setMode(mode: string) {
    this.state.pending = new Subject<Account[]>();
    this.state.mode.set(mode);
  }
  release() {
    this.state.pending.next(accounts);
    this.state.pending.complete();
  }
}
const edits = [
  {
    created_at: "2026-09-28T12:00:00Z",
    content:
      "<p>An earlier version with a long explanation that wraps at small widths.</p>",
    spoiler_text: "",
  },
  {
    created_at: "2026-09-28T13:45:00Z",
    content:
      "<p>The current version retains its content and native timestamp.</p>",
    spoiler_text: "Context",
  },
];
export default {
  title: "Start here/Sprints 17 and 18 review",
  component: FinalBatchReview,
  decorators: [
    applicationConfig({
      providers: [
        ListPreview,
        provideRouter([], withDisabledInitialNavigation()),
        importProvidersFrom(translocoTesting()),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: "local" })) },
        },
        {
          provide: ClientLists,
          useFactory: () => {
            const s = inject(ListPreview);
            return { get: () => s.get() };
          },
        },
        {
          provide: ProfileLists,
          useValue: { load: async () => {}, get: () => null },
        },
        {
          provide: ListFeedResolver,
          useFactory: () => {
            const s = inject(ListPreview);
            return {
              resolveHandles: () => s.resolve(),
              mergeMemberTimelines: () => of({ statuses: [] }),
            };
          },
        },
        {
          provide: PageDiagnostics,
          useValue: { info: () => {}, error: () => {} },
        },
        { provide: Api, useValue: { statusHistory: () => of(edits) } },
        {
          provide: AnonymousPublicApi,
          useValue: { getStatusHistory: () => of(edits) },
        },
      ],
    }),
  ],
} satisfies Meta<FinalBatchReview>;
export const LocalPanelsAndMetadata: StoryObj<FinalBatchReview> = {};
