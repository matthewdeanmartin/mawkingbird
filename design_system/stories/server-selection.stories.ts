import { provideRouter } from "@angular/router";
import {
  Component,
  DestroyRef,
  effect,
  inject,
  Injectable,
  input,
  signal,
  importProvidersFrom,
} from "@angular/core";
import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { ServerPicker } from "../../ui/src/app/server-picker/server-picker";
import { ServerDiscovery } from "../../ui/src/app/server-discovery/server-discovery";
import { SearchServerDiscovery } from "../../ui/src/app/search-server-discovery/search-server-discovery";
import { MastodonServers } from "../../ui/src/app/mastodon-servers";
import { SearchServerRejects } from "../../ui/src/app/search-server-rejects";
import { Terminology } from "../../ui/src/app/terminology";
import { translocoTesting } from "../../ui/src/app/i18n/i18n.testing";

@Injectable()
class ServerPreviewState {
  readonly mode = signal("working");
  readonly rejected = signal<string[]>([]);
  readonly directory = [
    {
      domain: "mastomini.local",
      category: "Local network · ESP32",
      users: 0,
      local: true,
      description:
        "Your household Mastomini; browser permission and a trusted certificate may be needed.",
    },
    {
      domain: "community.example",
      category: "general",
      users: 1200,
      description:
        "A community server with a longer description that wraps without widening the picker.",
    },
  ];
}

@Component({
  selector: "ds-server-selection-preview",
  imports: [ServerPicker, ServerDiscovery, SearchServerDiscovery],
  template: `
    <h1>Choose a server</h1>
    <p>
      Real picker and discovery components. All API probes on this preview are
      simulated, including manually typed hosts; no server or credential is
      changed.
    </p>
    <section aria-label="Server picker">
      <h2>Server picker</h2>
      <app-server-picker (picked)="selected.set($event)" />
    </section>
    <section aria-label="Server discovery">
      <h2>Server discovery</h2>
      <app-server-discovery (selected)="selected.set($event)" />
    </section>
    <section aria-label="Search server discovery">
      <h2>Search server discovery</h2>
      <app-search-server-discovery (selected)="selected.set($event)" />
    </section>
    <p role="status" class="selection-result">
      {{ selected() ? "Selected: " + selected() : "No selection yet" }}
    </p>
  `,
  styles: `
    :host {
      display: block;
      max-width: 620px;
    }
    section {
      margin-block: 28px;
      min-width: 0;
    }
  `,
})
class ServerSelectionPreview {
  readonly state = inject(ServerPreviewState);
  readonly mode = input("working");
  readonly selected = signal("");
  constructor() {
    effect(() => this.state.mode.set(this.mode()));
    const original = globalThis.fetch;
    globalThis.fetch = async (resource, options) => {
      const url = new URL(
        resource instanceof Request ? resource.url : String(resource),
        location.href,
      );
      if (!url.pathname.startsWith("/api/") && url.hostname !== "media.example")
        return original(resource, options);
      const abort = options?.signal;
      await new Promise<void>((resolve, reject) => {
        const cancel = () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        };
        const timer = setTimeout(() => {
          abort?.removeEventListener("abort", cancel);
          resolve();
        }, 600);
        if (abort?.aborted) cancel();
        else abort?.addEventListener("abort", cancel, { once: true });
      });
      if (
        this.state.mode() === "unreachable" ||
        url.hostname === "media.example"
      )
        throw new TypeError("Preview unavailable");
      const payload = url.pathname.includes("search")
        ? {
            accounts: [{ id: "preview-person" }],
            statuses: [{ id: "preview-post" }],
            hashtags: [],
          }
        : {
            title: "Community server",
            ...(this.state.mode() === "degraded"
              ? { thumbnail: "https://media.example/thumbnail.png" }
              : {}),
          };
      return new Response(JSON.stringify(payload), {
        headers: { "Content-Type": "application/json" },
      });
    };
    inject(DestroyRef).onDestroy(() => {
      globalThis.fetch = original;
    });
  }
}

export default {
  title: "Adoption/Server selection",
  component: ServerSelectionPreview,
  render: (args) => ({
    props: args,
    template: '<ds-server-selection-preview [mode]="mode" />',
  }),
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        importProvidersFrom(translocoTesting()),
        ServerPreviewState,
        {
          provide: Terminology,
          useValue: { words: signal({ posts: "posts" }) },
        },
        {
          provide: MastodonServers,
          useFactory: () => {
            const state = inject(ServerPreviewState);
            return {
              source: signal("bundled"),
              ensureLoaded: () => undefined,
              ready: async () => undefined,
              search: (query: string) =>
                state.directory.filter((server) =>
                  server.domain.includes(query),
                ),
              shuffled: (excluded: Set<string>) =>
                state.directory.filter(
                  (server) => !server.local && !excluded.has(server.domain),
                ),
            };
          },
        },
        {
          provide: SearchServerRejects,
          useFactory: () => {
            const state = inject(ServerPreviewState);
            return {
              count: () => state.rejected().length,
              domains: state.rejected,
              clear: () => state.rejected.set([]),
              add: (domain: string) =>
                state.rejected.update((values) => [
                  ...new Set([...values, domain]),
                ]),
            };
          },
        },
      ],
    }),
  ],
} satisfies Meta<ServerSelectionPreview>;
export const Working: StoryObj<ServerSelectionPreview> = {
  args: { mode: "working" },
};
export const Degraded: StoryObj<ServerSelectionPreview> = {
  args: { mode: "degraded" },
};
export const Unreachable: StoryObj<ServerSelectionPreview> = {
  args: { mode: "unreachable" },
};
