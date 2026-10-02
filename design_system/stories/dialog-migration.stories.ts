import {
  Component,
  Injectable,
  importProvidersFrom,
  inject,
  signal,
} from "@angular/core";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { delay, of, throwError } from "rxjs";
import { BugReportDialog } from "../../ui/src/app/bug-report-dialog/bug-report-dialog";
import { BulkAddDialog } from "../../ui/src/app/bulk-add-dialog/bulk-add-dialog";
import { BulkActionsDialog } from "../../ui/src/app/bulk-actions-dialog/bulk-actions-dialog";
import { MbButton } from "../../ui/src/app/design-system/button/button";
import { BugReport, type BugReportInput } from "../../ui/src/app/bug-report";
import { ErrorLog } from "../../ui/src/app/error-log";
import { DiagnosticLog } from "../../ui/src/app/diagnostic-log";
import { PageDiagnostics } from "../../ui/src/app/page-diagnostics";
import { BulkActions, type BulkPreview } from "../../ui/src/app/bulk-actions";
import { Api } from "../../ui/src/app/api";
import { Auth } from "../../ui/src/app/auth";
import { AnonymousAccount } from "../../ui/src/app/providers/anonymous/anonymous-account";
import { AnonymousFollows } from "../../ui/src/app/providers/anonymous/anonymous-follows";
import { AnonymousLists } from "../../ui/src/app/providers/anonymous/anonymous-lists";
import { AnonymousPublicApi } from "../../ui/src/app/providers/anonymous/anonymous-public-api";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

@Injectable()
class DialogFixtures {
  readonly open = signal("");
  readonly confirmed = signal(0);
  readonly added = signal(0);
  readonly planning = signal({ stage: "reading", accounts: 12, apiCalls: 2 });
  private finish?: (preview: BulkPreview) => void;
  private stopped = false;
  preview(): Promise<BulkPreview> {
    if (this.stopped) {
      this.stopped = false;
      return Promise.resolve({
        action: "list-unfollow",
        targets: 3,
        alreadyCorrect: 1,
        approximate: false,
      });
    }
    return new Promise((resolve) => {
      this.finish = resolve;
    });
  }
  resolve(cancelled = false): void {
    this.stopped = cancelled;
    this.finish?.({
      action: "list-unfollow",
      targets: 3,
      alreadyCorrect: 1,
      approximate: false,
      cancelled,
    });
  }
  confirm(): void {
    this.confirmed.update((count) => count + 1);
    this.open.set("");
  }
}

@Component({
  selector: "ds-dialog-migration",
  imports: [BugReportDialog, BulkAddDialog, BulkActionsDialog, MbButton],
  template: `
    <h1>Shared dialogs: migration batch 1</h1>
    <p>
      Production components, local fixtures only. No accounts are changed and no
      reports are sent.
    </p>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      <button mbButton type="button" (click)="state.open.set('report')">
        Report a bug
      </button>
      <button mbButton type="button" (click)="state.open.set('add')">
        Add people
      </button>
      <button mbButton type="button" (click)="state.open.set('bulk')">
        Review bulk action
      </button>
    </div>
    <p role="status">
      Added: {{ state.added() }}. Confirmed: {{ state.confirmed() }}.
    </p>
    @if (state.open() === "report") {
      <app-bug-report-dialog (closed)="state.open.set('')" />
    }
    @if (state.open() === "add") {
      <app-bulk-add-dialog
        targetId="fixture-list"
        targetKind="list"
        targetName="International community and science correspondents"
        (closed)="state.open.set('')"
        (added)="state.added.set($event)"
      />
    }
    @if (state.open() === "bulk") {
      <app-bulk-actions-dialog
        action="list-unfollow"
        [target]="{
          listId: 'fixture-list',
          listTitle: 'Community correspondents',
        }"
        (cancelled)="state.open.set('')"
        (confirmed)="state.confirm()"
      />
    }
  `,
})
class DialogMigration {
  readonly state = inject(DialogFixtures);
}

export default {
  title: "Adoption/Shared dialogs",
  component: DialogMigration,
  decorators: [
    applicationConfig({
      providers: [
        DialogFixtures,
        importProvidersFrom(translocoTesting()),
        {
          provide: ErrorLog,
          useValue: { entries: signal([{ text: "Fixture error" }]) },
        },
        {
          provide: DiagnosticLog,
          useValue: { entries: signal([{ event: "Fixture diagnostic" }]) },
        },
        {
          provide: PageDiagnostics,
          useValue: {
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
          },
        },
        {
          provide: BugReport,
          useValue: {
            buildMarkdown: (input: BugReportInput) =>
              [
                input.description || "(no description provided)",
                input.includeErrors ? "Fixture error" : "",
                input.includeDiagnostics ? "Fixture diagnostic" : "",
              ]
                .filter(Boolean)
                .join("\n"),
            buildGithubUrl: () => "about:blank",
          },
        },
        { provide: Auth, useValue: { isAnonymous: false } },
        ...[
          AnonymousAccount,
          AnonymousFollows,
          AnonymousLists,
          AnonymousPublicApi,
        ].map((provide) => ({ provide, useValue: {} })),
        {
          provide: Api,
          useValue: {
            search: (handle: string) =>
              of({
                accounts: handle === "missing" ? [] : [{ id: handle }],
              }).pipe(delay(150)),
            addToList: (_list: string, account: string) =>
              account === "error"
                ? throwError(() => new Error("Fixture failure"))
                : of({}).pipe(delay(150)),
          },
        },
        {
          provide: BulkActions,
          useFactory: () => {
            const state = inject(DialogFixtures);
            return {
              planning: state.planning,
              preview: () => state.preview(),
              cancelPlanning: () => state.resolve(true),
            };
          },
        },
      ],
    }),
  ],
} satisfies Meta<DialogMigration>;

export const Interactive: StoryObj<DialogMigration> = {};
