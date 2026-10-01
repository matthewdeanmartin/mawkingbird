import { moduleMetadata, type Meta, type StoryObj } from "@storybook/angular";
import { MbButton } from "../../ui/src/app/design-system/button/button";
import { MbRadioGroup } from "../../ui/src/app/design-system/radio-group/radio-group";
import { MbPostAction } from "../../ui/src/app/design-system/post-actions/post-actions";

const meta: Meta<MbButton> = {
  title: "Actions/Button",
  component: MbButton,
  tags: ["autodocs"],
  decorators: [moduleMetadata({ imports: [MbRadioGroup, MbPostAction] })],
  args: { variant: "solid", size: "regular" },
  render: (args) => ({
    props: args,
    template:
      '<button mbButton type="button" [variant]="variant" [size]="size">Save changes</button>',
  }),
};
export default meta;
type Story = StoryObj<MbButton>;
export const Solid: Story = {};
export const Outline: Story = { args: { variant: "outline" } };
export const Small: Story = { args: { size: "small" } };
export const Disabled: Story = {
  render: () => ({
    template: '<button mbButton type="button" disabled>Save changes</button>',
  }),
};

export const NativeLink: Story = {
  render: () => ({
    template:
      '<a mbButton href="#destination">Open destination</a><p id="destination">Native link destination</p>',
  }),
};

export const Danger: Story = {
  render: () => ({
    template:
      '<button mbButton tone="danger" type="button">Remove account</button>',
  }),
};

export const Consistency: Story = {
  render: () => ({
    props: {
      direction: "mastodon",
      directions: [
        { value: "mastodon", label: "Mastodon → Bluesky" },
        { value: "bluesky", label: "Bluesky → Mastodon" },
      ],
    },
    template: `
      <section style="display: grid; gap: 16px; max-width: 600px">
        <h2>Actions follow your accent</h2>
        <div style="display: flex; flex-wrap: wrap; gap: 8px">
          <button mbButton type="button">Save changes</button>
          <button mbButton variant="outline" type="button">Export friends</button>
          <a mbButton variant="outline" href="#destination">Open destination</a>
          <button mbButton tone="danger" type="button">Remove account</button>
          <button mbButton type="button" disabled>Saving changes</button>
          <button mbButton size="small" variant="outline" type="button">Small action</button>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px">
          <button class="btn" type="button">Legacy save</button>
          <button class="btn btn-outline" type="button">Legacy export</button>
          <button class="btn btn-outline active" aria-pressed="true" type="button">Selected</button>
          <button class="btn btn-danger" type="button" disabled>Unavailable removal</button>
        </div>
        <fieldset disabled>
          <legend>Unavailable while disconnected</legend>
          <button class="btn btn-outline active" type="button">Connect accounts first</button>
        </fieldset>
        <mb-radio-group label="Search direction" [options]="directions"
          [value]="direction" (valueChange)="direction = $event" />
        <div>
          <button mbPostAction type="button" [pressed]="true">Show replies</button>
          <button mbPostAction type="button">Refresh</button>
        </div>
        <button mbButton variant="outline" type="button">
          Export all followed accounts with a deliberately long translated label
        </button>
        <p id="destination">Native link destination</p>
      </section>`,
  }),
};
