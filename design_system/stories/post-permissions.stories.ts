import { Component, importProvidersFrom, signal } from "@angular/core";
import { applicationConfig, Meta, StoryObj } from "@storybook/angular";
import {
  PostPermissions,
  PostPermissionsValue,
} from "../../ui/src/app/post-permissions/post-permissions";
import { MbButton } from "../../ui/src/app/design-system/button/button";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

@Component({
  selector: "permissions-preview",
  imports: [PostPermissions, MbButton],
  template: `
    <button mbButton (click)="published.set(false); open.set(true)">
      Draft permissions
    </button>
    <button
      mbButton
      variant="outline"
      (click)="published.set(true); open.set(true)"
    >
      Published permissions
    </button>
    @if (open()) {
      <app-post-permissions
        [initial]="value()"
        [published]="published()"
        (closed)="open.set(false)"
        (saved)="value.set($event); open.set(false)"
      />
    }
    <p data-result>
      {{ value().visibility }} / {{ value().quoteApprovalPolicy }} /
      {{ value().muteNotifications }}
    </p>
  `,
})
class PermissionsPreview {
  open = signal(false);
  published = signal(false);
  value = signal<PostPermissionsValue>({
    visibility: "public",
    quoteApprovalPolicy: "public",
    muteNotifications: false,
  });
}
export default {
  title: "Adoption/Post permissions",
  component: PermissionsPreview,
  decorators: [
    applicationConfig({ providers: [importProvidersFrom(translocoTesting())] }),
  ],
} satisfies Meta<PermissionsPreview>;
export const SharedDialog: StoryObj<PermissionsPreview> = {};
