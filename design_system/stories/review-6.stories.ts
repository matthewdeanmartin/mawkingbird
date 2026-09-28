import { Component, input } from "@angular/core";
import { type Meta, type StoryObj } from "@storybook/angular";
import { PowerPost } from "../fixtures/power-post";
@Component({
  selector: "ds-consolidation-review",
  imports: [PowerPost],
  template: `<article class="ds-sheet">
    <h1>All the tools. Room to wrap.</h1>
    <p class="ds-intro">
      Sprint 6 · Full counts, native links and visible power-user actions.
    </p>
    <ds-power-post [extreme]="extreme()" />
  </article>`,
})
class ConsolidationReview {
  readonly extreme = input(false);
}
const meta: Meta<ConsolidationReview> = {
  title: "Start here/Sprint 6 review",
  component: ConsolidationReview,
};
export default meta;
type Story = StoryObj<ConsolidationReview>;
export const AllTools: Story = {};
export const Millions: Story = { args: { extreme: true } };
