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

export const Compact: Story = { args: { variant: "compact" } };
export const Link: Story = {
  render: () => ({
    template: `<p>
        6 discussions found.
        <button mbButton variant="link" type="button">Clear filters</button>
        or <a mbButton variant="link" href="#destination">open the list</a>.
      </p>
      <p id="destination">Native link destination</p>`,
  }),
};

/** All four weights where they belong: one primary, outline beside it, compact in dense rows, link in text. */
export const Weights: Story = {
  render: () => ({
    template: `
      <section style="display: grid; gap: 12px; max-width: 560px">
        <h2>Button weights</h2>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center">
          <button mbButton type="button">Scan</button>
          <button mbButton variant="outline" type="button">Choose a list</button>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center">
          <span>Sort</span>
          <button mbButton variant="compact" type="button" aria-pressed="true">Recent</button>
          <button mbButton variant="compact" type="button" aria-pressed="false">Popular</button>
          <button mbButton variant="compact" type="button">Scan deeper (+10 calls)</button>
          <button mbButton variant="compact" tone="danger" type="button">Stop</button>
          <button mbButton variant="compact" type="button" disabled>Scan deeper (+25 calls)</button>
        </div>
        <p>
          3 replies · 4 people ·
          <a mbButton variant="link" href="#destination">Open discussion</a> ·
          <button mbButton variant="link" type="button">Clear filters</button> ·
          <button mbButton variant="link" tone="danger" type="button">Forget this scan</button>
        </p>
        <p id="destination">Native link destination</p>
      </section>`,
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
        <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center">
          <button mbButton variant="compact" type="button">Compact action</button>
          <button mbButton variant="compact" type="button" aria-pressed="true">Compact selected</button>
          <button mbButton variant="compact" tone="danger" type="button">Compact stop</button>
          <a mbButton variant="compact" href="#destination">Compact destination</a>
        </div>
        <p>
          Text with <button mbButton variant="link" type="button">a link action</button>
          and <a mbButton variant="link" href="#destination">a link destination</a>.
        </p>
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
