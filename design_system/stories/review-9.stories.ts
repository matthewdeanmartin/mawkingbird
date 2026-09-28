import { FocusTrap } from "../../ui/src/app/a11y/focus-trap";
import { Component, importProvidersFrom, inject, signal } from "@angular/core";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { AppDialogs } from "../../ui/src/app/app-dialogs";
import { LeaveDialog } from "../../ui/src/app/leave-dialog/leave-dialog";
import {
  TranslateDialog,
  TranslateResult,
} from "../../ui/src/app/compose/translate-dialog/translate-dialog";
import { MbDialog } from "../../ui/src/app/design-system/dialog/dialog";
import { MbButton } from "../../ui/src/app/design-system/button/button";
import { Auth } from "../../ui/src/app/auth";
import { SessionTeardown } from "../../ui/src/app/session-teardown";
import { PageDiagnostics } from "../../ui/src/app/page-diagnostics";
import { AiTranslate } from "../../ui/src/app/ai-translate";
import { ClientPrefs } from "../../ui/src/app/client-prefs";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

@Component({
  selector: "ds-dialog-adoption-review",
  imports: [LeaveDialog, TranslateDialog, MbDialog, MbButton, FocusTrap],
  providers: [
    {
      provide: Auth,
      useValue: {
        isAnonymous: true,
        isBlueskyPrimary: false,
        account: () => null,
      },
    },
    {
      provide: SessionTeardown,
      useValue: {
        backup: () => {
          throw new Error("Preview backup unavailable");
        },
        clearAnonymousData: () => undefined,
        clearAllData: () => undefined,
      },
    },
    { provide: PageDiagnostics, useValue: { error: () => undefined } },
    { provide: ClientPrefs, useValue: { knownLanguages: () => ["eo"] } },
    {
      provide: AiTranslate,
      useFactory: () => {
        let attempt = 0;
        return {
          translateText: () =>
            new Promise((resolve, reject) => {
              const fail = ++attempt === 1;
              setTimeout(
                () =>
                  fail
                    ? reject(new Error("Preview model unavailable. Try again."))
                    : resolve({
                        text: "Saluton al ĉiuj",
                        model: "local preview",
                        target: "Esperanto",
                      }),
                350,
              );
            }),
        };
      },
    },
  ],
  template: `<article class="ds-sheet">
    <h1>Shared dialogs in real flows.</h1>
    <p class="ds-intro">
      Sprint 9 · Confirmations and prompts use the real AppDialogs service.
      Leave and translation use their production components with local services.
    </p>
    <div class="ds-actions">
      <button mbButton type="button" (click)="confirm()">
        Destructive confirmation
      </button>
      <button mbButton type="button" (click)="prompt()">Editable prompt</button>
      <button mbButton type="button" (click)="queue()">
        Two queued decisions
      </button>
      <button mbButton type="button" (click)="leave.set(true)">
        Leave options
      </button>
      <button mbButton type="button" (click)="translate.set(true)">
        Translate a draft
      </button>
      <button mbButton type="button" (click)="nested.set(true)">
        Nested confirmation
      </button>
    </div>
    <p>
      Result: <output>{{ result() }}</output>
    </p>
    <p>
      Translation fails on the first attempt, then succeeds on retry. Edit the
      result before replacing or appending it. Closing during work remains
      available.
    </p>
    <p>
      Leave choices only report a result here. Backup failure is simulated; no
      accounts, storage, downloads, model calls or moderation actions are
      performed.
    </p>
    @if (leave()) {
      <app-leave-dialog
        (closed)="leave.set(false)"
        (chose)="result.set($event); leave.set(false)"
      />
    }
    @if (translate()) {
      <app-translate-dialog
        post="Hello everyone"
        (closed)="translate.set(false)"
        (applied)="applied($event)"
      />
    }
    <button mbButton type="button" (click)="legacy.set(true)">
      Legacy parent confirmation
    </button>
    @if (legacy()) {
      <section
        class="ds-section ds-dialog-tools"
        role="dialog"
        aria-label="Legacy parent"
        (keyup.escape)="legacy.set(false)"
        appFocusTrap
        (dismissed)="legacy.set(false)"
      >
        <button mbButton type="button" (click)="confirm()">
          Open native child
        </button>
        <button mbButton type="button" (click)="legacy.set(false)">
          Close legacy parent
        </button>
      </section>
    }
    @if (nested()) {
      <mb-dialog
        title="Parent dialog"
        closeLabel="Close parent"
        (dismissed)="nested.set(false)"
      >
        <p>
          The child uses AppDialogs. Escape should close only the top dialog.
        </p>
        <button mbButton type="button" (click)="confirm()">
          Open child confirmation
        </button>
      </mb-dialog>
    }
  </article>`,
})
class DialogAdoptionReview {
  private readonly dialogs = inject(AppDialogs);
  readonly result = signal("No decision yet.");
  readonly leave = signal(false);
  readonly translate = signal(false);
  readonly nested = signal(false);
  readonly legacy = signal(false);
  async confirm(): Promise<void> {
    const accepted = await this.dialogs.confirm(
      `This preview deletes nothing.
The real caller owns the action.`,
      { title: "Remove this item?", confirmLabel: "Remove", danger: true },
    );
    this.result.set(accepted ? "Confirmed" : "Cancelled");
  }
  async prompt(): Promise<void> {
    const value = await this.dialogs.prompt(
      "An empty value is valid; cancel returns null.",
      "Morning list",
      {
        title: "Rename list",
        inputLabel: "List name",
        confirmLabel: "Save name",
      },
    );
    this.result.set(value === null ? "Cancelled" : JSON.stringify(value));
  }
  async queue(): Promise<void> {
    const first = this.dialogs.confirm("First decision", {
      title: "First queued dialog",
    });
    const second = this.dialogs.alert("Second decision", {
      title: "Second queued dialog",
    });
    const accepted = await first;
    await second;
    this.result.set(
      accepted ? "Queue complete: confirmed" : "Queue complete: cancelled",
    );
  }
  applied(value: TranslateResult): void {
    this.result.set(JSON.stringify(value));
    this.translate.set(false);
  }
}
const meta: Meta<DialogAdoptionReview> = {
  title: "Start here/Sprint 9 review",
  component: DialogAdoptionReview,
  decorators: [
    applicationConfig({
      providers: [AppDialogs, importProvidersFrom(translocoTesting())],
    }),
  ],
};
export default meta;
export const AppDialogsReview: StoryObj<DialogAdoptionReview> = {};
