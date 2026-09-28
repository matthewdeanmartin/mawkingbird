import { moduleMetadata, type Meta, type StoryObj } from "@storybook/angular";
import {
  MbNavigation,
  MbNavLink,
} from "../../ui/src/app/design-system/navigation/navigation";
import { MbTabs, MbTab } from "../../ui/src/app/design-system/tabs/tabs";

const meta: Meta = {
  title: "Navigation/Links and tabs",
  decorators: [
    moduleMetadata({ imports: [MbNavigation, MbNavLink, MbTabs, MbTab] }),
  ],
};
export default meta;
export const LinkRows: StoryObj = {
  render: () => ({
    template:
      '<nav mbNavigation label="Settings"><a mbNavLink href="#profile-example" current>Profile</a><a mbNavLink href="#privacy-example">Privacy</a><a mbNavLink href="#notifications-example">Notifications</a></nav><p id="profile-example">Profile destination</p><p id="privacy-example">Privacy destination</p><p id="notifications-example">Notifications destination</p>',
  }),
};
export const NavigationTabs: StoryObj = {
  render: () => ({
    template:
      '<nav mbNavigation label="Search categories" presentation="tabs"><a mbNavLink href="#posts-example" current>Posts</a><a mbNavLink href="#people-example">People</a><a mbNavLink href="#tags-example">Tags</a></nav><p id="posts-example">Posts destination</p><p id="people-example">People destination</p><p id="tags-example">Tags destination</p>',
  }),
};
export const ContentTabs: StoryObj = {
  render: () => ({
    template:
      '<mb-tabs label="Feed views" selected="timeline"><ng-template mbTab value="timeline" label="Timeline"><p>Your timeline is shown here.</p><label>Find in feed <input type="search" /></label></ng-template><ng-template mbTab value="members" label="Members"><p>The people in this feed.</p></ng-template><ng-template mbTab value="disabled" label="Unavailable" disabled><p>Unavailable content.</p></ng-template><ng-template mbTab value="analytics" label="Analytics"><p>Details about this feed.</p></ng-template></mb-tabs>',
  }),
};
export const LongTabs: StoryObj = {
  render: () => ({
    template:
      '<div class="ds-narrow"><mb-tabs label="Lange Kategorien"><ng-template mbTab value="a" label="Benachrichtigungseinstellungen"><p>Erste Ansicht.</p></ng-template><ng-template mbTab value="b" label="Datenschutzeinstellungen"><p>Zweite Ansicht.</p></ng-template></mb-tabs></div>',
  }),
};
