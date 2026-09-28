import {
  Component,
  Injectable,
  importProvidersFrom,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { of, timer, mergeMap, throwError } from "rxjs";
import en from "../../ui/public/i18n/en.json";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";
import { AdminApi } from "../../ui/src/app/admin/admin-api";
import { AppDialogs } from "../../ui/src/app/app-dialogs";
import { AdminAnnouncements } from "../../ui/src/app/admin/announcements/admin-announcements";
import { AdminDomains } from "../../ui/src/app/admin/domains/admin-domains";
import { AdminDomainAllows } from "../../ui/src/app/admin/domain-allows/admin-domain-allows";
import { AdminEmailBlocks } from "../../ui/src/app/admin/email-blocks/admin-email-blocks";
import { AdminCanonicalBlocks } from "../../ui/src/app/admin/canonical-blocks/admin-canonical-blocks";
import { AdminIpBlocks } from "../../ui/src/app/admin/ip-blocks/admin-ip-blocks";
import { MbCheckbox } from "../../ui/src/app/design-system/checkbox/checkbox";

@Injectable()
class FormReviewState {
  readonly payload = signal("No submissions yet.");
  readonly attempts = new Set<string>();
  save(kind: string, data: object, result: object) {
    this.payload.set(JSON.stringify({ kind, ...data }));
    const fail = !this.attempts.has(kind);
    this.attempts.add(kind);
    return timer(300).pipe(
      mergeMap(() =>
        fail
          ? throwError(() => new Error("Local preview failure"))
          : of(result),
      ),
    );
  }
}
function adminFixture() {
  const state = inject(FormReviewState);
  const empty = () => of([]);
  const removed = () => of({});
  return {
    announcements: empty,
    domainBlocks: empty,
    domainAllows: empty,
    emailDomainBlocks: empty,
    canonicalEmailBlocks: empty,
    ipBlocks: empty,
    createAnnouncement: (content: string, published: boolean) =>
      state.save(
        "announcement",
        { content, published },
        { id: "preview", content, published, reactions: [] },
      ),
    createDomainBlock: (domain: string, severity: string) =>
      state.save(
        "domain",
        { domain, severity },
        { id: "preview", domain, severity },
      ),
    createDomainAllow: (domain: string) =>
      state.save("allow", { domain }, { id: "preview", domain }),
    createEmailDomainBlock: (domain: string) =>
      state.save("email", { domain }, { id: "preview", domain }),
    createCanonicalEmailBlock: (email: string) =>
      state.save(
        "canonical",
        { email },
        { id: "preview", canonical_email_hash: "preview-only-hash" },
      ),
    testCanonicalEmailBlock: (email: string) =>
      state.save("lookup", { email }, []),
    createIpBlock: (ip: string, severity: string, comment: string) =>
      state.save(
        "ip",
        { ip, severity, comment },
        { id: "preview", ip, severity, comment },
      ),
    deleteAnnouncement: removed,
    deleteDomainBlock: removed,
    deleteDomainAllow: removed,
    deleteEmailDomainBlock: removed,
    deleteCanonicalEmailBlock: removed,
    deleteIpBlock: removed,
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
}
@Component({
  selector: "ds-admin-forms-review",
  imports: [
    AdminAnnouncements,
    AdminDomains,
    AdminDomainAllows,
    AdminEmailBlocks,
    AdminCanonicalBlocks,
    AdminIpBlocks,
    MbCheckbox,
    FormsModule,
  ],
  providers: [
    FormReviewState,
    { provide: AdminApi, useFactory: adminFixture },
    { provide: AppDialogs, useValue: { confirm: async () => false } },
  ],
  template: `<article class="ds-sheet">
    <h1>Forms with labels that stay put.</h1>
    <p class="ds-intro">
      Sprint 8 · Six production admin screens using shared fields and buttons.
      Each form's first save fails locally; retry keeps your entries.
    </p>
    <section class="ds-section" aria-label="Announcements">
      <h2>Announcements</h2>
      <app-admin-announcements />
    </section>
    <section class="ds-section" aria-label="Domain blocks">
      <h2>Domain blocks</h2>
      <app-admin-domains />
    </section>
    <section class="ds-section" aria-label="Allowed domains">
      <h2>Allowed domains</h2>
      <app-admin-domain-allows />
    </section>
    <section class="ds-section" aria-label="Email blocks">
      <h2>Email domain blocks</h2>
      <app-admin-email-blocks />
    </section>
    <section class="ds-section" aria-label="IP blocks">
      <h2>IP blocks</h2>
      <app-admin-ip-blocks />
    </section>
    <section class="ds-section" aria-label="Canonical email">
      <h2>Canonical email blocks and lookup</h2>
      <app-admin-canonical-blocks />
    </section>
    <section class="ds-section" aria-label="Registration consent">
      <h2>Registration consent</h2>
      <p class="ds-intro">
        Isolated view of the adopted Login control; the real registration guard
        and agreement payload are exercised by the app tests.
      </p>
      <mb-checkbox [label]="consentLabel" [(ngModel)]="agreed" />
    </section>
    <p>
      Latest local payload: <output>{{ state.payload() }}</output>
    </p>
    <p class="ds-intro">
      No network, account creation or storage writes. Existing row-level
      moderation tools are outside this form-adoption batch.
    </p>
  </article>`,
})
class AdminFormsReview {
  readonly state = inject(FormReviewState);
  agreed = false;
  readonly consentLabel = en.pages["login.register.agree"];
}
const meta: Meta<AdminFormsReview> = {
  title: "Start here/Sprint 8 review",
  component: AdminFormsReview,
  decorators: [
    applicationConfig({ providers: [importProvidersFrom(translocoTesting())] }),
  ],
};
export default meta;
export const AppForms: StoryObj<AdminFormsReview> = {};
