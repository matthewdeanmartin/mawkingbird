import { Component, signal } from "@angular/core";
import { type Meta, type StoryObj, moduleMetadata } from "@storybook/angular";
import {
  MbToolbar,
  MbToolbarButton,
} from "../../ui/src/app/design-system/toolbar/toolbar";

@Component({
  selector: "mb-toolbar-demo",
  imports: [MbToolbar, MbToolbarButton],
  template: `
    <mb-toolbar label="Feed controls">
      <button
        mbToolbarButton
        [pressed]="boosts()"
        (click)="boosts.set(!boosts())"
      >
        <span aria-hidden="true">↻</span> Boosts
      </button>
      <button
        mbToolbarButton
        [pressed]="replies()"
        (click)="replies.set(!replies())"
      >
        Replies
      </button>
      <button mbToolbarButton [pressed]="calm()" (click)="calm.set(!calm())">
        Calm feed
      </button>
      <button mbToolbarButton disabled>Translate</button>
      <button
        mbToolbarButton
        (click)="refreshes.set(refreshes() + 1)"
        aria-label="Refresh feed"
        title="Refresh feed"
      >
        <span aria-hidden="true">⟳</span>
      </button>
    </mb-toolbar>
    <p class="ds-intro" role="status">
      {{
        refreshes()
          ? "Feed refreshed " + refreshes() + " time(s)."
          : "Tab enters the toolbar. Arrow keys move; Space activates."
      }}
    </p>
  `,
})
export class ToolbarDemo {
  readonly boosts = signal(true);
  readonly replies = signal(false);
  readonly calm = signal(false);
  readonly refreshes = signal(0);
}

const meta: Meta<ToolbarDemo> = {
  title: "Actions/Toolbar",
  component: ToolbarDemo,
};
export default meta;
export const FeedControls: StoryObj<ToolbarDemo> = {};
export const Narrow: StoryObj = {
  decorators: [moduleMetadata({ imports: [ToolbarDemo] })],
  render: () => ({
    template: '<div class="ds-narrow"><mb-toolbar-demo /></div>',
  }),
};
export const LongLabels: StoryObj = {
  decorators: [moduleMetadata({ imports: [MbToolbar, MbToolbarButton] })],
  render: () => ({
    template:
      '<div class="ds-narrow"><mb-toolbar label="Timeline-Einstellungen"><button mbToolbarButton [pressed]="true">Geteilte Beiträge anzeigen</button><button mbToolbarButton [pressed]="false">Antworten berücksichtigen</button><button mbToolbarButton>Aktualisieren</button></mb-toolbar></div>',
  }),
};
