import {
  Component,
  Injectable,
  computed,
  inject,
  signal,
  importProvidersFrom,
} from "@angular/core";
import { provideRouter, withDisabledInitialNavigation } from "@angular/router";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { Observable, of } from "rxjs";
import { SettingsPrivacy } from "../../ui/src/app/pages/settings/privacy/settings-privacy";
import { SettingsContent } from "../../ui/src/app/pages/settings/content/settings-content";
import { Api } from "../../ui/src/app/api";
import { Auth } from "../../ui/src/app/auth";
import { Server } from "../../ui/src/app/server";
import { ClientPrefs } from "../../ui/src/app/client-prefs";
import { TrustedAccounts, TrustLevel } from "../../ui/src/app/trusted-accounts";
import { AppDialogs } from "../../ui/src/app/app-dialogs";
import { HttpErrorResponse } from "../../ui/src/app/testing/http-error";
import {
  MbToolbar,
  MbToolbarButton,
} from "../../ui/src/app/design-system/toolbar/toolbar";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";
@Injectable()
class SettingsPreview {
  readonly response = signal("Fail once");
  readonly requests = signal<string[]>([]);
  readonly analytics = signal(false);
  readonly visibility = signal("public");
  readonly language = signal("en");
  readonly knownLanguages = signal(["en"]);
  readonly level = signal<TrustLevel>("individuals");
  readonly cw = signal(false);
  readonly sensitive = signal(false);
  readonly people = signal([
    { key: "one", acct: "a-long-person-name@a-long-community-domain.example" },
  ]);
  readonly confirmation = signal("No destructive action requested.");
  update(form: FormData) {
    const values = Object.fromEntries(form.entries());
    this.requests.update((rs) => [...rs, JSON.stringify(values)]);
    const mode = this.response();
    if (mode === "Fail once") this.response.set("Success");
    return new Observable((observer) => {
      const timer = setTimeout(
        () => {
          if (mode === "Fail once")
            observer.error(new HttpErrorResponse({ status: 503 }));
          else {
            observer.next({});
            observer.complete();
          }
        },
        mode === "Slow" ? 2000 : 350,
      );
      return () => clearTimeout(timer);
    });
  }
}
@Component({
  selector: "ds-settings-composition-review",
  imports: [SettingsPrivacy, SettingsContent, MbToolbar, MbToolbarButton],
  styles: ["output { overflow-wrap: anywhere; }"],
  template: `<article class="ds-sheet">
    <h1>Settings forms with shared controls.</h1>
    <p class="ds-intro">
      Sprint 15 · Real Privacy and Trust pages with in-memory services. No
      account, storage or reading preference is changed.
    </p>
    <mb-toolbar label="Settings preview" density="compact">
      <button
        mbToolbarButton
        [pressed]="page() === 'privacy'"
        (click)="page.set('privacy')"
      >
        Privacy
      </button>
      <button
        mbToolbarButton
        [pressed]="page() === 'trust'"
        (click)="page.set('trust')"
      >
        Trust
      </button>
    </mb-toolbar>
    <mb-toolbar label="Next privacy response" density="compact">
      @for (mode of modes; track mode) {
        <button
          mbToolbarButton
          [pressed]="state.response() === mode"
          (click)="state.response.set(mode)"
        >
          {{ mode }}
        </button>
      }
    </mb-toolbar>
    <p>
      Privacy writes one changed field; Fail once rolls it back and permits
      retry. Slow waits two seconds. Trust choices apply locally and keep named
      people when switching levels. Destructive confirmation is simulated as
      Cancel.
    </p>
    <p>
      Credential calls:
      <output data-count>{{ state.requests().length }}</output>
    </p>
    <output data-requests>{{
      state.requests().join(
        "
"
      )
    }}</output>
    <p>
      Successful defaults:
      <output data-defaults
        >{{ state.visibility() }} / {{ state.language() }}</output
      >
    </p>
    <p>
      Local trust:
      <output data-trust
        >{{ state.level() }} / CW {{ state.cw() }} / sensitive
        {{ state.sensitive() }} / people {{ state.people().length }}</output
      >
    </p>
    <output data-confirmation>{{ state.confirmation() }}</output>
    @if (page() === "privacy") {
      <section aria-label="Privacy form"><app-settings-privacy /></section>
    } @else {
      <section aria-label="Trust form"><app-settings-content /></section>
    }
  </article>`,
})
class SettingsReview {
  readonly state = inject(SettingsPreview);
  readonly page = signal("privacy");
  readonly modes = ["Fail once", "Success", "Slow"];
}
export default {
  title: "Start here/Sprint 15 review",
  component: SettingsReview,
  decorators: [
    applicationConfig({
      providers: [
        SettingsPreview,
        importProvidersFrom(translocoTesting()),
        provideRouter([], withDisabledInitialNavigation()),
        {
          provide: Api,
          useFactory: () => {
            const s = inject(SettingsPreview);
            return {
              verifyCredentials: () =>
                of({
                  locked: false,
                  discoverable: true,
                  bot: false,
                  source: {
                    privacy: "public",
                    language: "en",
                    sensitive: false,
                  },
                }),
              updateCredentials: (f: FormData) => s.update(f),
              preferences: () => of({ "reading:expand:spoilers": true }),
            };
          },
        },
        {
          provide: ClientPrefs,
          useFactory: () => {
            const s = inject(SettingsPreview);
            return {
              analytics: s.analytics,
              setAnalytics: (v: boolean) => s.analytics.set(v),
              setDefaultVisibility: (v: string) => s.visibility.set(v),
              setPostingLanguage: (v: string) => s.language.set(v),
              addKnownLanguage: (v: string) =>
                s.knownLanguages.update((languages) =>
                  languages.includes(v) ? languages : [...languages, v],
                ),
            } satisfies Pick<
              ClientPrefs,
              | "analytics"
              | "setAnalytics"
              | "setDefaultVisibility"
              | "setPostingLanguage"
              | "addKnownLanguage"
            >;
          },
        },
        {
          provide: Auth,
          useValue: { isAnonymous: false, isBlueskyPrimary: false },
        },
        {
          provide: Server,
          useValue: { baseUrl: () => "https://example.test" },
        },
        {
          provide: AppDialogs,
          useFactory: () => {
            const s = inject(SettingsPreview);
            return {
              confirm: async () => {
                s.confirmation.set("Confirmation requested; simulated Cancel.");
                return false;
              },
            };
          },
        },
        {
          provide: TrustedAccounts,
          useFactory: () => {
            const s = inject(SettingsPreview);
            return {
              level: s.level,
              setLevel: (v: TrustLevel) => s.level.set(v),
              trustsFollows: computed(
                () => s.level() === "follows" || s.level() === "follows-boosts",
              ),
              expandAllCwSetting: s.cw,
              showAllSensitiveSetting: s.sensitive,
              setExpandAllCw: (v: boolean) => s.cw.set(v),
              setShowAllSensitive: (v: boolean) => s.sensitive.set(v),
              list: s.people,
              count: computed(() => s.people().length),
              untrust: (key: string) =>
                s.people.update((ps) => ps.filter((p) => p.key !== key)),
              clearAll: () => s.people.set([]),
              revokeAll: () => {
                s.level.set("none");
                s.cw.set(false);
                s.sensitive.set(false);
                s.people.set([]);
              },
            };
          },
        },
      ],
    }),
  ],
} satisfies Meta<SettingsReview>;
export const PrivacyAndTrust: StoryObj<SettingsReview> = {};
