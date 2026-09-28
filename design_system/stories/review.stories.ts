import { moduleMetadata, type Meta, type StoryObj } from "@storybook/angular";
import { MbCheckbox } from "../../ui/src/app/design-system/checkbox/checkbox";
import { MbSettingsRow } from "../../ui/src/app/design-system/settings-row/settings-row";
import { MbButton } from "../../ui/src/app/design-system/button/button";

const meta: Meta = {
  title: "Start here/Sprint 1 review",
  decorators: [
    moduleMetadata({ imports: [MbCheckbox, MbSettingsRow, MbButton] }),
  ],
};
export default meta;

export const Review: StoryObj = {
  render: () => ({
    template: `
    <article class="ds-sheet">
      <h1>Familiar controls. One shared layout.</h1>
      <p class="ds-intro">Sprint 1 · Preview for review. Try the controls, use Tab and Space, then switch theme and text direction in the toolbar.</p>
      <section class="ds-section">
        <h2>Settings, with room for an explanation</h2>
        <mb-settings-row heading="Privacy">
          <mb-checkbox label="Approve new followers" hint="People must request permission before following you." />
          <mb-checkbox label="Suggest my account to others" [checked]="true" status="Saved ✓" />
        </mb-settings-row>
      </section>
      <section class="ds-section">
        <h2>Long labels in a narrow space</h2>
        <div class="ds-narrow ds-stack">
          <mb-checkbox label="Show expanded content warnings for people I follow, including posts shared into my timeline" hint="The explanation follows the label column. No hand-tuned indent." />
          <mb-settings-row heading="Notifications">
            <mb-checkbox label="Notify me when someone requests to follow me" />
          </mb-settings-row>
        </div>
      </section>
      <section class="ds-section ds-stack">
        <h2>Feedback belongs beside its control</h2>
        <mb-checkbox label="Include my account in search results" error="Your change could not be saved. Please try again." />
        <mb-checkbox label="Managed by your server" hint="This setting is currently unavailable." [checked]="true" [disabled]="true" />
      </section>
      <section class="ds-section">
        <h2>Actions</h2>
        <div class="ds-actions">
          <button mbButton type="button">Save changes</button>
          <button mbButton type="button" variant="outline">Cancel</button>
          <button mbButton type="button" size="small">Follow</button>
          <button mbButton type="button" disabled>Unavailable</button>
        </div>
      </section>
    </article>
  `,
  }),
};
