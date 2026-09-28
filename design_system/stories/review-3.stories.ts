import { Component, signal } from "@angular/core";
import { type Meta, type StoryObj } from "@storybook/angular";
import {
  MbToolbar,
  MbToolbarButton,
} from "../../ui/src/app/design-system/toolbar/toolbar";
import {
  MbNavigation,
  MbNavLink,
} from "../../ui/src/app/design-system/navigation/navigation";
import { MbTabs, MbTab } from "../../ui/src/app/design-system/tabs/tabs";
import {
  MbPageHeader,
  MbSection,
} from "../../ui/src/app/design-system/page-header/page-header";
import { MbButton } from "../../ui/src/app/design-system/button/button";

@Component({
  selector: "mb-sprint-three-demo",
  imports: [
    MbToolbar,
    MbToolbarButton,
    MbNavigation,
    MbNavLink,
    MbTabs,
    MbTab,
    MbPageHeader,
    MbSection,
    MbButton,
  ],
  template: `
    <article class="ds-sheet">
      <h1>Actions belong together.</h1>
      <p class="ds-intro">
        Sprint 3 · Compact toolbars for repeated actions. Clear links for
        navigation. Tabs for views of the same content.
      </p>
      <section class="ds-section">
        <mb-page-header
          title="Home"
          [level]="2"
          description="Posts from the people and feeds you follow."
        >
          <button
            mbButton
            type="button"
            (click)="
              notice.set(
                'The writing action stays separate from feed controls.'
              )
            "
          >
            Write a post
          </button>
        </mb-page-header>
        <mb-toolbar label="Home feed controls">
          <button
            mbToolbarButton
            [pressed]="boosts()"
            (click)="boosts.set(!boosts())"
          >
            <span aria-hidden="true">↻</span> Boosts
          </button>
          <button
            mbToolbarButton
            [pressed]="replies()"
            (click)="replies.set(!replies())"
          >
            Replies
          </button>
          <button
            mbToolbarButton
            [pressed]="calm()"
            (click)="calm.set(!calm())"
          >
            Calm feed
          </button>
          <button mbToolbarButton disabled>Translate</button>
          <button
            mbToolbarButton
            aria-label="Refresh feed"
            title="Refresh feed"
            (click)="refresh()"
          >
            <span aria-hidden="true">⟳</span>
          </button>
        </mb-toolbar>
        <p class="ds-intro" role="status">{{ notice() }}</p>
        <mb-tabs label="Home feed views" selected="timeline">
          <ng-template mbTab value="timeline" label="Timeline">
            <p>
              Your feed stays in this column. Toggle the toolbar controls above
              without navigating away.
            </p>
          </ng-template>
          <ng-template mbTab value="members" label="Members"
            ><p>The people who appear in this feed.</p></ng-template
          >
          <ng-template mbTab value="analytics" label="Analytics"
            ><p>Activity and composition of this feed.</p></ng-template
          >
        </mb-tabs>
      </section>
      <mb-section title="Settings are destinations">
        <nav mbNavigation label="Settings destinations">
          <a
            mbNavLink
            href="#profile-destination"
            [current]="destination() === 'profile'"
            (click)="destination.set('profile')"
            >Profile</a
          >
          <a
            mbNavLink
            href="#privacy-destination"
            [current]="destination() === 'privacy'"
            (click)="destination.set('privacy')"
            >Privacy</a
          >
          <a
            mbNavLink
            href="#notifications-destination"
            [current]="destination() === 'notifications'"
            (click)="destination.set('notifications')"
            >Notifications</a
          >
        </nav>
        <p [id]="destination() + '-destination'">
          Preview destination: {{ destination() }}. These are ordinary links,
          with normal browser behavior.
        </p>
      </mb-section>
      <mb-section title="A compact toolbar in a narrow panel">
        <div class="ds-narrow">
          <mb-toolbar label="Reader controls">
            <button
              mbToolbarButton
              aria-label="Decrease text size"
              (click)="fontSize.set(fontSize() - 1)"
            >
              A−
            </button>
            <button
              mbToolbarButton
              aria-label="Increase text size"
              (click)="fontSize.set(fontSize() + 1)"
            >
              A+
            </button>
            <button
              mbToolbarButton
              [pressed]="quiet()"
              (click)="quiet.set(!quiet())"
            >
              Quiet reading
            </button>
            <button mbToolbarButton (click)="fontSize.set(16)">
              Reset size
            </button>
          </mb-toolbar>
          <p role="status">Reader size: {{ fontSize() }}px</p>
        </div>
      </mb-section>
    </article>
  `,
})
class SprintThreeDemo {
  readonly boosts = signal(true);
  readonly replies = signal(false);
  readonly calm = signal(false);
  readonly quiet = signal(false);
  readonly fontSize = signal(16);
  readonly destination = signal("profile");
  readonly notice = signal(
    "Use Tab to enter the toolbar, then arrows to move between actions.",
  );
  private refreshCount = 0;
  refresh(): void {
    this.notice.set("Feed refreshed " + ++this.refreshCount + " time(s).");
  }
}

const meta: Meta<SprintThreeDemo> = {
  title: "Start here/Sprint 3 review",
  component: SprintThreeDemo,
};
export default meta;
export const Review: StoryObj<SprintThreeDemo> = {};
