import { Component, ElementRef, signal, viewChild } from "@angular/core";
import { type Meta, type StoryObj } from "@storybook/angular";
import { MbDialog } from "../../ui/src/app/design-system/dialog/dialog";
import { MbButton } from "../../ui/src/app/design-system/button/button";
import {
  MbNavigation,
  MbNavLink,
} from "../../ui/src/app/design-system/navigation/navigation";

@Component({
  selector: "mb-drawer-review",
  imports: [MbDialog, MbButton, MbNavigation, MbNavLink],
  template: `
    <article class="ds-sheet">
      <h1>Navigation drawer</h1>
      <button #trigger mbButton type="button" (click)="open.set(true)">
        Open settings menu
      </button>
      <p>The current page stays in place behind the navigation.</p>
      @if (open()) {
        <mb-dialog
          title="Settings"
          closeLabel="Close"
          presentation="drawer"
          [returnFocusTo]="opener().nativeElement"
          [closeOnBackdrop]="true"
          (dismissed)="open.set(false)"
        >
          <nav mbNavigation label="Settings sections">
            @for (label of sections; track label) {
              <a
                mbNavLink
                href="#"
                (click)="$event.preventDefault(); open.set(false)"
                >{{ label }}</a
              >
            }
          </nav>
        </mb-dialog>
      }
    </article>
  `,
})
class NavigationDrawerReview {
  readonly open = signal(false);
  readonly opener = viewChild.required<MbButton, ElementRef<HTMLButtonElement>>(
    "trigger",
    { read: ElementRef },
  );
  readonly sections = [
    "Public profile",
    "Writing",
    "Privacy",
    "Appearance",
    "Internationalization",
    "Connections",
    "Signed-in accounts",
    "Notifications",
    "RSS feeds",
    "Local storage",
    "Feature flags",
    "Import/Export Config",
  ];
}

const meta: Meta<NavigationDrawerReview> = {
  title: "Overlays/Navigation drawer",
  component: NavigationDrawerReview,
};
export default meta;
export const Review: StoryObj<NavigationDrawerReview> = {};
