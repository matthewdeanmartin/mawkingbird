import { moduleMetadata, type Meta, type StoryObj } from "@storybook/angular";
import { MbCheckbox } from "../../ui/src/app/design-system/checkbox/checkbox";
import { MbSettingsRow } from "../../ui/src/app/design-system/settings-row/settings-row";

const meta: Meta<MbSettingsRow> = {
  title: "Layout/Settings row",
  component: MbSettingsRow,
  decorators: [moduleMetadata({ imports: [MbCheckbox] })],
  args: { heading: "Privacy" },
  render: (args) => ({
    props: args,
    template:
      '<mb-settings-row [heading]="heading"><mb-checkbox label="Approve new followers" hint="One explanation, aligned with its label." /></mb-settings-row>',
  }),
};
export default meta;
export const Default: StoryObj<MbSettingsRow> = {};
export const Narrow: StoryObj<MbSettingsRow> = {
  render: (args) => ({
    props: args,
    template:
      '<div class="ds-narrow"><mb-settings-row [heading]="heading"><mb-checkbox label="Approve new followers" hint="This row stacks based on its container width." /></mb-settings-row></div>',
  }),
};
