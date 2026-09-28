import {
  Component,
  Injectable,
  importProvidersFrom,
  inject,
  signal,
} from "@angular/core";
import { provideRouter, withDisabledInitialNavigation } from "@angular/router";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { of, timer, mergeMap, throwError } from "rxjs";
import { SettingsPrivacy } from "../../ui/src/app/pages/settings/privacy/settings-privacy";
import { AdminAnnouncements } from "../../ui/src/app/admin/announcements/admin-announcements";
import { Api } from "../../ui/src/app/api";
import { AdminApi } from "../../ui/src/app/admin/admin-api";
import { ClientPrefs } from "../../ui/src/app/client-prefs";
import { AppDialogs } from "../../ui/src/app/app-dialogs";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

@Injectable()
class ReviewState {
  readonly request = signal("No credential changes yet.");
  readonly created = signal("No announcement created yet.");
  readonly analytics = signal(false);
  failLocked = true;
}
@Component({
  selector: "ds-checkbox-adoption-review",
  imports: [SettingsPrivacy, AdminAnnouncements],
  providers: [
    ReviewState,
    {
      provide: Api,
      useFactory: () => {
        const state = inject(ReviewState);
        return {
          verifyCredentials: () =>
            of({
              locked: false,
              discoverable: true,
              bot: false,
              source: { privacy: "public", sensitive: false, language: "en" },
            }),
          updateCredentials: (data: FormData) => {
            state.request.set(
              JSON.stringify(Object.fromEntries(data.entries())),
            );
            const fail = data.has("locked") && state.failLocked;
            if (fail) state.failLocked = false;
            return timer(350).pipe(
              mergeMap(() =>
                fail
                  ? throwError(
                      () => new Error("Preview unavailable. Please retry."),
                    )
                  : of({}),
              ),
            );
          },
        };
      },
    },
    {
      provide: ClientPrefs,
      useFactory: () => {
        const state = inject(ReviewState);
        return {
          analytics: state.analytics,
          setAnalytics: (value: boolean) => state.analytics.set(value),
          setDefaultVisibility: () => undefined,
          addKnownLanguage: () => undefined,
        };
      },
    },
    {
      provide: AdminApi,
      useFactory: () => {
        const state = inject(ReviewState);
        return {
          announcements: () => of([]),
          createAnnouncement: (content: string, published: boolean) => {
            state.created.set(JSON.stringify({ content, published }));
            return of({ id: "preview", content, published, reactions: [] });
          },
          publishAnnouncement: () =>
            of({
              id: "preview",
              content: "Preview announcement",
              published: true,
              reactions: [],
            }),
          unpublishAnnouncement: () =>
            of({
              id: "preview",
              content: "Preview announcement",
              published: false,
              reactions: [],
            }),
        };
      },
    },
    { provide: AppDialogs, useValue: { confirm: async () => false } },
  ],
  template: `<article class="ds-sheet">
    <h1>Shared checkboxes in real screens.</h1>
    <p class="ds-intro">
      Sprint 7 · Five more app controls now reuse the approved widget. These are
      the production Privacy and admin components with local service fixtures.
    </p>
    <p>
      Try Require follow requests: the first save fails and rolls back. Try
      again to save. Each change sends just one field.
    </p>
    <section class="ds-section" aria-label="Privacy adoption">
      <app-settings-privacy />
    </section>
    <p>
      Last credential payload: <output>{{ state.request() }}</output>
    </p>
    <section class="ds-section" aria-label="Announcement adoption">
      <h2>Admin: announcement publishing</h2>
      <app-admin-announcements />
    </section>
    <p>
      Last creation payload: <output>{{ state.created() }}</output>
    </p>
    <p class="ds-intro">
      No network or storage writes. Moderation confirmation is disabled in this
      preview. Other admin fields and buttons remain migration work for Sprint
      8.
    </p>
  </article>`,
})
class CheckboxAdoptionReview {
  readonly state = inject(ReviewState);
}
const meta: Meta<CheckboxAdoptionReview> = {
  title: "Start here/Sprint 7 review",
  component: CheckboxAdoptionReview,
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([], withDisabledInitialNavigation()),
        importProvidersFrom(translocoTesting()),
      ],
    }),
  ],
};
export default meta;
export const AppControls: StoryObj<CheckboxAdoptionReview> = {};
