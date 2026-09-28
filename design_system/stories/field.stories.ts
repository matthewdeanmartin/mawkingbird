import { moduleMetadata, type Meta, type StoryObj } from "@storybook/angular";
import { FormsModule } from "@angular/forms";
import { MbControl, MbField } from "../../ui/src/app/design-system/field/field";

const meta: Meta = {
  title: "Forms/Field",
  decorators: [moduleMetadata({ imports: [MbField, MbControl, FormsModule] })],
  args: {
    label: "Display name",
    hint: "Choose the name people see on your profile.",
    error: "",
    required: false,
    disabled: false,
  },
  render: (args) => ({
    props: args,
    template:
      '<mb-field [label]="label" [hint]="hint" [error]="error"><input mbControl type="text" [required]="required" [disabled]="disabled" ngModel /></mb-field>',
  }),
};
export default meta;
type Story = StoryObj;
export const Text: Story = {};
export const Required: Story = { args: { required: true } };
export const Disabled: Story = { args: { disabled: true } };
export const Invalid: Story = {
  args: { error: "Enter a display name.", required: true },
};
export const Number: Story = {
  render: () => ({
    template:
      '<mb-field label="Daily reading goal" hint="Choose a number between 1 and 100."><input mbControl type="number" min="1" max="100" value="20" /></mb-field>',
  }),
};
export const Password: Story = {
  render: () => ({
    template:
      '<mb-field label="App password" hint="Use an app-specific password from your provider."><input mbControl type="password" autocomplete="new-password" /></mb-field>',
  }),
};
export const Select: Story = {
  render: () => ({
    template:
      '<mb-field label="Post visibility" hint="Choose who can see new posts."><select mbControl><option value="public">Everyone</option><option value="followers">Followers</option><option value="mentioned">Mentioned people</option></select></mb-field>',
  }),
};
export const Textarea: Story = {
  render: () => ({
    template:
      '<mb-field label="Profile description" hint="A few words about you."><textarea mbControl rows="4"></textarea></mb-field>',
  }),
};
export const LongLabel: Story = {
  render: () => ({
    template:
      '<div class="ds-narrow"><mb-field label="Standard-Sichtbarkeit für zukünftige Beiträge" hint="Diese Einstellung gilt nur für neue Beiträge."><select mbControl><option>Nur bestätigte Follower</option><option>Alle Personen</option></select></mb-field></div>',
  }),
};
