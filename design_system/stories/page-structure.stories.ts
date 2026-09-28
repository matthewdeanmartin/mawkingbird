import { moduleMetadata, type Meta, type StoryObj } from "@storybook/angular";
import {
  MbPageHeader,
  MbSection,
} from "../../ui/src/app/design-system/page-header/page-header";
import { MbButton } from "../../ui/src/app/design-system/button/button";

const meta: Meta<MbPageHeader> = {
  title: "Layout/Page structure",
  component: MbPageHeader,
  decorators: [moduleMetadata({ imports: [MbSection, MbButton] })],
  args: {
    title: "Home",
    description: "Posts from the people and feeds you follow.",
    level: 1,
  },
};
export default meta;
export const Header: StoryObj<MbPageHeader> = {};
export const HeaderWithAction: StoryObj = {
  render: () => ({
    template:
      '<mb-page-header title="Home" description="A familiar heading and a deliberate primary action."><button mbButton type="button">Write a post</button></mb-page-header>',
  }),
};
export const LongHeading: StoryObj = {
  render: () => ({
    template:
      '<div class="ds-narrow"><mb-page-header title="Benachrichtigungen und Datenschutzeinstellungen" description="This description remains readable when the heading wraps." /></div>',
  }),
};
export const Section: StoryObj = {
  render: () => ({
    template:
      '<mb-section title="Account preferences"><p>Related controls belong together, under a real heading.</p></mb-section>',
  }),
};
