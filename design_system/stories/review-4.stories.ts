import { Component, DestroyRef, inject, input, signal } from "@angular/core";
import { type Meta, type StoryObj } from "@storybook/angular";
import { MbDialog } from "../../ui/src/app/design-system/dialog/dialog";
import { MbPopover } from "../../ui/src/app/design-system/popover/popover";
import { MbActionMenu } from "../../ui/src/app/design-system/action-menu/action-menu";
import { MbDisclosure } from "../../ui/src/app/design-system/disclosure/disclosure";
import { MbNotice } from "../../ui/src/app/design-system/notice/notice";
import { MbButton } from "../../ui/src/app/design-system/button/button";
import { MbField, MbControl } from "../../ui/src/app/design-system/field/field";

@Component({
  selector: "mb-overlay-review",
  imports: [
    MbDialog,
    MbPopover,
    MbActionMenu,
    MbDisclosure,
    MbNotice,
    MbButton,
    MbField,
    MbControl,
  ],
  template: `
    <article class="ds-sheet">
      <h1>Overlays with a clear way back.</h1>
      <p class="ds-intro">
        Sprint 4 · Familiar surfaces, predictable dismissal, and focus that
        returns to where you started.
      </p>
      <section class="ds-section">
        <h2>Dialog</h2>
        <button mbButton type="button" (click)="open.set(true)">
          Edit feed details
        </button>
        <p class="ds-intro">
          The first save fails locally so you can inspect the error and retry.
          Nothing leaves this preview.
        </p>
      </section>
      <section class="ds-section">
        <h2>Compact action menu</h2>
        <div class="ds-actions ds-actions-compact">
          <mb-action-menu
            label="Feed actions"
            [actions]="actions"
            (chosen)="action($event)"
          />
          <button mbButton type="button" variant="outline" size="small">
            Next control
          </button>
        </div>
        <p role="status">{{ result() }}</p>
      </section>
      <section class="ds-section">
        <h2>A small nonmodal panel</h2>
        <mb-popover label="Reading options">
          <p>Reader options apply only to this preview.</p>
          <mb-field label="Reading width"
            ><select mbControl>
              <option>Comfortable</option>
              <option>Wide</option>
            </select></mb-field
          >
        </mb-popover>
      </section>
      <section class="ds-section">
        <h2>Disclosure and notices</h2>
        <mb-disclosure label="Why did this post appear?">
          <p>
            You follow this author. This explanation stays in the page and does
            not trap focus.
          </p>
          <a href="#notice-example">Read the notice below</a>
        </mb-disclosure>
        <div id="notice-example">
          <mb-notice title="Your draft is kept here"
            >Closing this preview does not publish anything.</mb-notice
          >
        </div>
      </section>
    </article>
    @if (open()) {
      <mb-dialog
        [title]="
          longContent()
            ? 'Feed details with a deliberately long translated-style title that wraps'
            : 'Edit feed details'
        "
        closeLabel="Close"
        description="Update the local preview name. Your current feed stays in place."
        [busy]="saving()"
        [closeOnBackdrop]="backdrop()"
        (dismissed)="open.set(false)"
      >
        <mb-field label="Feed name"
          ><input
            mbControl
            [value]="name()"
            (input)="name.set($any($event.target).value)"
        /></mb-field>
        @if (error()) {
          <mb-notice tone="error" announcement="alert" title="Could not save">{{
            error()
          }}</mb-notice>
        }
        @if (saving()) {
          <mb-notice announcement="status">Saving…</mb-notice>
        }
        <div class="ds-dialog-tools">
          <mb-popover label="About this feed"
            ><p>This panel is above the dialog, and Escape closes it first.</p>
            <button
              type="button"
              mbButton
              size="small"
              (click)="result.set('Read feed note')"
            >
              Read note
            </button></mb-popover
          >
          <button
            mbButton
            type="button"
            variant="outline"
            size="small"
            (click)="nested.set(true)"
            [disabled]="saving()"
          >
            Review removal
          </button>
        </div>
        @if (longContent()) {
          @for (line of paragraphs; track $index) {
            <p>{{ line }}</p>
          }
        }
        <button
          mbDialogActions
          mbButton
          variant="outline"
          type="button"
          (click)="open.set(false)"
          [disabled]="saving()"
        >
          Cancel
        </button>
        <button
          mbDialogActions
          mbButton
          type="button"
          (click)="save()"
          [disabled]="saving()"
        >
          Save changes
        </button>
        @if (nested()) {
          <mb-dialog
            title="Remove this feed?"
            closeLabel="Keep feed"
            description="Removal is only simulated here. The safe choice receives initial focus."
            (dismissed)="nested.set(false)"
          >
            <mb-notice tone="error"
              >You can continue editing instead.</mb-notice
            >
            <button
              mbDialogActions
              mbButton
              type="button"
              (click)="nested.set(false); result.set('Removal simulated')"
            >
              Remove feed
            </button>
          </mb-dialog>
        }
      </mb-dialog>
    }
  `,
})
class OverlayReview {
  readonly longContent = input(false);
  readonly backdrop = input(false);
  readonly open = signal(false);
  readonly nested = signal(false);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly name = signal("Home reading");
  readonly result = signal("No action selected.");
  readonly actions = [
    { id: "rename", label: "Rename feed" },
    { id: "export", label: "Export feed", disabled: true },
    { id: "refresh", label: "Refresh feed" },
    { id: "remove", label: "Remove feed…", danger: true },
  ];
  readonly paragraphs = Array.from(
    { length: 12 },
    () =>
      "Long content stays inside the dialog. Its actions remain reachable by keyboard and scrolling, even on a small screen.",
  );
  private attempts = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }
  action(id: string): void {
    this.result.set("Selected: " + id);
    if (id === "rename" || id === "remove") {
      this.open.set(true);
      this.nested.set(id === "remove");
    }
  }
  save(): void {
    this.saving.set(true);
    this.error.set("");
    this.timer = setTimeout(() => {
      this.saving.set(false);
      if (++this.attempts === 1)
        this.error.set(
          "The connection failed. Your edited name is still here; try again.",
        );
      else {
        this.open.set(false);
        this.result.set("Saved: " + this.name());
      }
    }, 500);
  }
}

const meta: Meta<OverlayReview> = {
  title: "Start here/Sprint 4 review",
  component: OverlayReview,
};
export default meta;
export const Review: StoryObj<OverlayReview> = {};
export const LongDialog: StoryObj<OverlayReview> = {
  args: { longContent: true },
};
export const BackdropDismissal: StoryObj<OverlayReview> = {
  args: { backdrop: true },
};
