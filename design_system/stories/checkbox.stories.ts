import { type Meta, type StoryObj } from "@storybook/angular";
import { MbCheckbox } from "../../ui/src/app/design-system/checkbox/checkbox";

const meta: Meta<MbCheckbox> = {
  title: "Forms/Checkbox",
  component: MbCheckbox,
  tags: ["autodocs"],
  args: {
    label: "Approve new followers",
    hint: "People must request permission before following you.",
    checked: false,
    disabled: false,
    indeterminate: false,
    error: "",
    status: "",
  },
};
export default meta;
type Story = StoryObj<MbCheckbox>;
export const Default: Story = {};
export const Checked: Story = { args: { checked: true } };
export const Disabled: Story = { args: { checked: true, disabled: true } };
export const Indeterminate: Story = { args: { indeterminate: true } };
export const SaveFailed: Story = {
  args: { error: "Your change could not be saved. Please try again." },
};
export const Saved: Story = { args: { checked: true, status: "Saved ✓" } };
export const LongLabel: Story = {
  args: {
    label:
      "Show expanded content warnings for people I follow, including posts shared by other people in my timeline",
    hint: "This explanation stays aligned with the label, even when the label wraps onto several lines.",
  },
  render: (args) => ({
    props: args,
    template:
      '<div class="ds-narrow"><mb-checkbox [label]="label" [hint]="hint" /></div>',
  }),
};
export const German: Story = {
  args: {
    label: "Neue Follower-Anfragen vor dem Folgen bestätigen",
    hint: "Diese Einstellung gilt für alle zukünftigen Anfragen.",
  },
};
