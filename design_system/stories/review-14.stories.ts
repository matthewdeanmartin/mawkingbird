import {
  Component,
  Injectable,
  computed,
  inject,
  signal,
  importProvidersFrom,
} from "@angular/core";
import { HttpErrorResponse } from "../../ui/src/app/testing/http-error";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { Observable, of, throwError } from "rxjs";
import { Api } from "../../ui/src/app/api";
import { Auth } from "../../ui/src/app/auth";
import { Server } from "../../ui/src/app/server";
import { Account } from "../../ui/src/app/models";
import { PageDiagnostics } from "../../ui/src/app/page-diagnostics";
import { ClientLists } from "../../ui/src/app/lists/client-lists";
import { AnonymousAccount } from "../../ui/src/app/providers/anonymous/anonymous-account";
import { AnonymousLists } from "../../ui/src/app/providers/anonymous/anonymous-lists";
import { AnonymousFollows } from "../../ui/src/app/providers/anonymous/anonymous-follows";
import { ListDialog } from "../../ui/src/app/list-dialog/list-dialog";
import { MbDialog } from "../../ui/src/app/design-system/dialog/dialog";
import { MbButton } from "../../ui/src/app/design-system/button/button";
import {
  MbToolbar,
  MbToolbarButton,
} from "../../ui/src/app/design-system/toolbar/toolbar";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";
const serverTitle =
  "Server list with a long descriptive name that must wrap beside its checkbox";
const collectionName =
  "Public collection with an equally long descriptive name";
@Injectable()
class PreviewState {
  readonly mode = signal("Success");
  readonly anonymous = signal(false);
  readonly empty = signal(false);
  readonly unsupported = signal(false);
  readonly calls = signal<string[]>([]);
  readonly follows = signal(0);
  readonly browser = signal([
    { id: "browser", title: "Browser-private reading list", member: false },
  ]);
  readonly local = signal([
    { id: "local", title: "Anonymous local reading list", member: false },
  ]);
  followed = false;
  serial = 0;
  write(name: string, args: unknown[], result: unknown = {}) {
    this.calls.update((c) => [...c, JSON.stringify({ name, args })]);
    const mode = this.mode();
    if (mode === "Fail once" || mode === "Follow first")
      this.mode.set("Success");
    return new Observable((observer) => {
      const timer = setTimeout(
        () => {
          if (
            mode === "Fail once" ||
            (mode === "Follow first" && name === "addToList")
          ) {
            observer.error(
              new HttpErrorResponse({
                status: mode === "Follow first" ? 404 : 503,
                error: { error: "Preview write failed. Try again." },
              }),
            );
          } else {
            if (name === "follow") this.follows.update((n) => n + 1);
            observer.next(result);
            observer.complete();
          }
        },
        mode === "Slow" ? 2000 : 300,
      );
      return () => clearTimeout(timer);
    });
  }
  store(local: boolean) {
    const rows = local ? this.local : this.browser;
    return {
      lists: rows,
      count: computed(() => rows().length),
      hasMember: (id: string) => rows().some((r) => r.id === id && r.member),
      setMember: (id: string, _handle: string, member: boolean) =>
        rows.update((rs) =>
          rs.map((r) => (r.id === id ? { ...r, member } : r)),
        ),
      create: (title: string) => {
        const row = { id: `created-${++this.serial}`, title, member: false };
        rows.update((rs) => [...rs, row]);
        return row;
      },
    };
  }
}
@Component({
  selector: "ds-membership-review",
  imports: [ListDialog, MbDialog, MbButton, MbToolbar, MbToolbarButton],
  styles: ["output { overflow-wrap: anywhere; }"],
  template: `<article class="ds-sheet">
    <h1>List membership, one shared form.</h1>
    <p class="ds-intro">
      Sprint 14 · Real list dialog, local services only. No account, follow,
      browser storage or provider is changed.
    </p>
    <mb-toolbar label="Write response" density="compact">
      @for (mode of modes; track mode) {
        <button
          mbToolbarButton
          [pressed]="state.mode() === mode"
          (click)="state.mode.set(mode)"
        >
          {{ mode }}
        </button>
      }
    </mb-toolbar>
    <p>
      Fail once retains confirmed membership and entered names. Follow first
      requires explicit consent. Slow holds a write for two seconds.
    </p>
    <mb-toolbar label="Membership previews" density="compact">
      <button mbToolbarButton (click)="open('signed')">
        Lists and collections
      </button>
      <button mbToolbarButton (click)="open('anonymous')">
        Anonymous lists
      </button>
      <button mbToolbarButton (click)="open('empty')">Empty lists</button>
      <button mbToolbarButton (click)="open('unsupported')">
        Collections unavailable
      </button>
      <button mbToolbarButton (click)="parent.set(true)">
        Nested membership
      </button>
    </mb-toolbar>
    <p>
      Server writes: <output data-writes>{{ state.calls().length }}</output
      >. Public follows: <output data-follows>{{ state.follows() }}</output
      >.
    </p>
    <output data-calls>{{
      state.calls().join(
        "
"
      )
    }}</output>
    @if (parent()) {
      <mb-dialog
        title="Account actions"
        closeLabel="Close"
        (dismissed)="parent.set(false)"
      >
        <button mbButton type="button" (click)="open('signed')">
          Edit memberships
        </button>
      </mb-dialog>
    }
    @if (opened()) {
      <app-list-dialog
        username="a-long-account-name@international-community.example"
        accountId="target"
        [account]="target"
        (closed)="opened.set(false)"
      />
    }
  </article>`,
})
class MembershipReview {
  readonly state = inject(PreviewState);
  readonly modes = ["Success", "Fail once", "Follow first", "Slow"];
  readonly opened = signal(false);
  readonly parent = signal(false);
  readonly target = {
    id: "target",
    username: "target",
    acct: "target@example.test",
    display_name: "Target",
  } as Account;
  open(mode: string) {
    this.state.anonymous.set(mode === "anonymous");
    this.state.empty.set(mode === "empty");
    this.state.unsupported.set(mode === "unsupported");
    if (mode === "empty") {
      this.state.browser.set([]);
      this.state.local.set([]);
    }
    this.opened.set(true);
  }
}
export default {
  title: "Start here/Sprint 14 review",
  component: MembershipReview,
  decorators: [
    applicationConfig({
      providers: [
        PreviewState,
        importProvidersFrom(translocoTesting()),
        {
          provide: Auth,
          useFactory: () => {
            const s = inject(PreviewState);
            return {
              get isAnonymous() {
                return s.anonymous();
              },
              account: () => ({ id: "me" }),
            };
          },
        },
        {
          provide: Server,
          useValue: { baseUrl: () => "https://example.test" },
        },
        {
          provide: PageDiagnostics,
          useValue: { info: () => {}, error: () => {} },
        },
        {
          provide: ClientLists,
          useFactory: () => inject(PreviewState).store(false),
        },
        {
          provide: AnonymousLists,
          useFactory: () => inject(PreviewState).store(true),
        },
        {
          provide: AnonymousAccount,
          useValue: { server: () => "https://example.test" },
        },
        {
          provide: AnonymousFollows,
          useFactory: () => {
            const s = inject(PreviewState);
            const find = () =>
              s.followed ? { key: "target@example.test" } : null;
            return {
              find,
              findByAccountId: find,
              follow: () => {
                s.followed = true;
                return { ok: true };
              },
            };
          },
        },
        {
          provide: Api,
          useFactory: () => {
            const s = inject(PreviewState);
            return {
              lists: () =>
                of(s.empty() ? [] : [{ id: "server", title: serverTitle }]),
              listAccounts: () => of([]),
              accountCollections: () =>
                s.unsupported()
                  ? throwError(() => new HttpErrorResponse({ status: 404 }))
                  : of(
                      s.empty()
                        ? []
                        : [{ id: "collection", name: collectionName }],
                    ),
              accountInCollections: () => of([]),
              addToList: (...args: unknown[]) => s.write("addToList", args),
              removeFromList: (...args: unknown[]) =>
                s.write("removeFromList", args),
              follow: (...args: unknown[]) => s.write("follow", args),
              createList: (title: string) =>
                s.write("createList", [title], {
                  id: `server-${++s.serial}`,
                  title,
                }),
              createCollection: (name: string) =>
                s.write("createCollection", [name], {
                  collection: { id: `collection-${++s.serial}`, name },
                }),
              addCollectionAccount: (...args: unknown[]) =>
                s.write("addCollectionAccount", args, {
                  collection_item: { id: "item-1" },
                }),
              removeCollectionItem: (...args: unknown[]) =>
                s.write("removeCollectionItem", args),
              getCollection: () =>
                of({
                  collection: {
                    items: [{ id: "item-1", account_id: "target" }],
                  },
                }),
            };
          },
        },
      ],
    }),
  ],
} satisfies Meta<MembershipReview>;
export const Memberships: StoryObj<MembershipReview> = {};
