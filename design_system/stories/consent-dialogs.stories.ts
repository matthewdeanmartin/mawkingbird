import { Component, importProvidersFrom, signal } from "@angular/core";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { ProxyConsentDialog } from "../../ui/src/app/providers/shortener/proxy-consent-dialog/proxy-consent-dialog";
import { TwitterConsentDialog } from "../../ui/src/app/providers/twitter/twitter-consent-dialog/twitter-consent-dialog";
import { SHORTENER_CATALOG } from "../../ui/src/app/providers/shortener/shortener-catalog";
import { CORS_PROXY_CATALOG } from "../../ui/src/app/providers/cors-proxy/cors-proxy-catalog";
import { TWITTER_SOURCE_CATALOG } from "../../ui/src/app/providers/twitter/twitter-source";
import { MbButton } from "../../ui/src/app/design-system/button/button";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

@Component({
  selector: "ds-consent-dialogs",
  imports: [ProxyConsentDialog, TwitterConsentDialog, MbButton],
  template: `
    <h1>Consent dialogs: shared shell, specific disclosures</h1>
    <p>
      Real app components. Acceptance only increments a preview counter; nothing
      is stored or sent.
    </p>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      @for (choice of choices; track choice) {
        <button mbButton type="button" (click)="open.set(choice)">
          {{ choice }}
        </button>
      }
    </div>
    <p role="status">
      Accepted: {{ accepted() }}. Cancelled: {{ cancelled() }}.
    </p>
    @if (open().startsWith("Shortener")) {
      <app-proxy-consent-dialog
        [shortener]="shortener"
        [proxy]="open().includes('own') ? ownProxy : publicProxy"
        [carriesCredential]="!open().includes('no key')"
        (accepted)="accept()"
        (cancelled)="cancel()"
      />
    }
    @if (open().startsWith("Twitter")) {
      <app-twitter-consent-dialog
        [source]="source"
        [proxy]="open().includes('own') ? ownProxy : publicProxy"
        (accepted)="accept()"
        (cancelled)="cancel()"
      />
    }
  `,
})
class ConsentDialogs {
  readonly choices = [
    "Shortener key",
    "Shortener own proxy",
    "Shortener no key",
    "Twitter key",
    "Twitter own proxy",
  ];
  readonly shortener = SHORTENER_CATALOG.find((entry) => entry.id === "dub")!;
  readonly publicProxy = CORS_PROXY_CATALOG.find(
    (entry) => entry.id === "allorigins",
  )!;
  readonly ownProxy = CORS_PROXY_CATALOG.find(
    (entry) => entry.id === "custom",
  )!;
  readonly source = TWITTER_SOURCE_CATALOG[0];
  readonly open = signal("");
  readonly accepted = signal(0);
  readonly cancelled = signal(0);
  accept(): void {
    this.accepted.update((count) => count + 1);
    this.open.set("");
  }
  cancel(): void {
    this.cancelled.update((count) => count + 1);
    this.open.set("");
  }
}

export default {
  title: "Adoption/Consent dialogs",
  component: ConsentDialogs,
  decorators: [
    applicationConfig({ providers: [importProvidersFrom(translocoTesting())] }),
  ],
} satisfies Meta<ConsentDialogs>;
export const Interactive: StoryObj<ConsentDialogs> = {};
