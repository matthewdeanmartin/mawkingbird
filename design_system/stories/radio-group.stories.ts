import { type Meta, type StoryObj } from "@storybook/angular";
import { MbRadioGroup } from "../../ui/src/app/design-system/radio-group/radio-group";

const meta: Meta<MbRadioGroup> = {
  title: "Forms/Radio group",
  component: MbRadioGroup,
  tags: ["autodocs"],
  args: {
    label: "Expand content warnings",
    hint: "Choose one default for your timeline.",
    value: "none",
    error: "",
    required: false,
    disabled: false,
    options: [
      {
        value: "none",
        label: "Keep warnings collapsed",
        hint: "Reveal each post when you choose to read it.",
      },
      {
        value: "follows",
        label: "Expand posts from people I follow",
        hint: "Warnings from everyone else stay collapsed.",
      },
      {
        value: "all",
        label:
          "Expand posts from people I follow, including posts shared by other people in my timeline",
        hint: "Long labels and their explanations share a stable text column.",
      },
    ],
  },
};
export default meta;
type Story = StoryObj<MbRadioGroup>;
export const Default: Story = {};
export const Required: Story = { args: { value: null, required: true } };
export const Invalid: Story = {
  args: {
    value: null,
    required: true,
    error: "Choose a content-warning default.",
  },
};
export const Disabled: Story = { args: { disabled: true } };
export const UnavailableOption: Story = {
  args: {
    options: [
      { value: "none", label: "Keep warnings collapsed" },
      {
        value: "managed",
        label: "Managed by your server",
        hint: "Unavailable on this server.",
        disabled: true,
      },
    ],
  },
};
export const Narrow: Story = {
  render: (args) => ({
    props: args,
    template:
      '<div class="ds-narrow"><mb-radio-group [label]="label" [hint]="hint" [options]="options" [value]="value" /></div>',
  }),
};
