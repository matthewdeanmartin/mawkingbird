import { type Meta, type StoryObj } from "@storybook/angular";
import { MbSaveFeedback } from "../../ui/src/app/design-system/save-feedback/save-feedback";

const meta: Meta<MbSaveFeedback> = {
  title: "Forms/Save feedback",
  component: MbSaveFeedback,
  args: { state: "saving", message: "Saving your changes…" },
};
export default meta;
type Story = StoryObj<MbSaveFeedback>;
export const Saving: Story = {};
export const Saved: Story = { args: { state: "saved", message: "Saved ✓" } };
export const Failed: Story = {
  args: {
    state: "error",
    message:
      "Your change could not be saved. The previous value has been restored.",
  },
};
