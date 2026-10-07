import { type Meta, type StoryObj } from "@storybook/angular";
import { MbHelp } from "../../ui/src/app/design-system/help/help";

const meta: Meta<MbHelp> = {
  title: "Feedback/Help",
  component: MbHelp,
  tags: ["autodocs"],
  args: { label: "About YouTube playback" },
};
export default meta;
type Story = StoryObj<MbHelp>;
export const Default: Story = {
  render: (args) => ({
    props: args,
    template: `<span>Open on YouTube</span> <mb-help [label]="label">
      <p>YouTube opens paused at the link's start time. Your current playback position doesn't transfer between views.</p>
      <p>Loading the player connects to YouTube. Playback starts only when you press Play.</p>
    </mb-help>`,
  }),
};
export const Narrow: Story = {
  render: (args) => ({
    props: args,
    template: `<div style="width: 260px; text-align: end">Playback options
      <mb-help [label]="label"><p>Optional explanations stay behind this control. The help surface stays within the viewport and scrolls when necessary.</p></mb-help>
    </div>`,
  }),
};
