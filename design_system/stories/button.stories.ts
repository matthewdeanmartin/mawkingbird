import { type Meta, type StoryObj } from "@storybook/angular";
import { MbButton } from "../../ui/src/app/design-system/button/button";

const meta: Meta<MbButton> = {
  title: "Actions/Button",
  component: MbButton,
  tags: ["autodocs"],
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
