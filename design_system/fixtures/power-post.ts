import { Component, input, signal } from "@angular/core";
import {
  MbPostActions,
  MbPostAction,
  MbActionCount,
} from "../../ui/src/app/design-system/post-actions/post-actions";
import {
  MbMetadata,
  MbContentLink,
} from "../../ui/src/app/design-system/metadata/metadata";
import { MbActionMenu } from "../../ui/src/app/design-system/action-menu/action-menu";
@Component({
  selector: "ds-power-post",
  imports: [
    MbPostActions,
    MbPostAction,
    MbActionCount,
    MbMetadata,
    MbContentLink,
    MbActionMenu,
  ],
  template: `
    <article class="ds-content-card" aria-label="Full-tools post">
      <mb-metadata
        ><a mbContentLink href="#power-account"
          ><strong>Morgan · all the tools</strong></a
        ><span dir="auto">@morgan@community.example</span
        ><time datetime="2026-09-27T15:00:00Z">27 Sep, 15:00</time></mb-metadata
      >
      <p class="ds-content-copy">
        Keep the tools where I can reach them. Big numbers and a narrow column
        should add rows, not hide actions or break the page.
      </p>
      <mb-post-actions label="All post tools">
        <button mbPostAction type="button" (click)="choose('Reply')">
          ↩ Reply <span mbActionCount>{{ extreme() ? "123,456" : "150" }}</span>
        </button>
        <button
          mbPostAction
          type="button"
          [pressed]="boosted()"
          (click)="boosted.set(!boosted())"
        >
          ↻ Boost
        </button>
        <button mbPostAction type="button" (click)="choose('Boosted by')">
          <span mbActionCount>{{ extreme() ? "9,999,999" : "2,000" }}</span>
          boosts
        </button>
        <button
          mbPostAction
          type="button"
          [pressed]="liked()"
          (click)="liked.set(!liked())"
        >
          ☆ Like
        </button>
        <button mbPostAction type="button" (click)="choose('Liked by')">
          <span mbActionCount>{{ extreme() ? "12,345,678" : "150" }}</span>
          likes
        </button>
        @for (action of commands; track action) {
          <button mbPostAction type="button" (click)="choose(action)">
            {{ action }}
          </button>
        }
        <button
          mbPostAction
          type="button"
          [pressed]="saved()"
          (click)="saved.set(!saved())"
        >
          ⚑ Bookmark
        </button>
        <a mbPostAction href="#power-thread">Thread reader</a>
        <a mbPostAction href="#power-long">Long text reader</a>
        <a mbPostAction href="#power-original">Open original</a>
        <button mbPostAction type="button" disabled>
          AI translate unavailable
        </button>
      </mb-post-actions>
      <div class="ds-power-danger">
        <mb-action-menu
          label="Moderation and removal"
          [actions]="danger"
          (chosen)="choose('Confirmation preview: ' + $event)"
        />
      </div>
      <p class="ds-content-feedback" role="status">{{ result() }}</p>
      <p id="power-account" class="ds-intro">
        All actions are local demonstrations. Ownership and provider-specific
        tools appear together here to stress the layout.
      </p>
      <span id="power-thread"></span><span id="power-long"></span
      ><span id="power-original"></span>
    </article>
  `,
})
export class PowerPost {
  readonly extreme = input(false);
  readonly liked = signal(false);
  readonly boosted = signal(false);
  readonly saved = signal(false);
  readonly result = signal("");
  readonly commands = [
    "Quote",
    "Share",
    "Copy link",
    "Boost on my blog",
    "Like on my blog",
    "Translate",
    "Edit history",
    "Pin",
    "Quote policy",
    "Edit",
    "Save as to-do",
  ];
  readonly danger = [
    { id: "Mute post", label: "Mute post", danger: true },
    { id: "Report", label: "Report", danger: true },
    { id: "Delete", label: "Delete", danger: true },
  ];
  choose(action: string): void {
    this.result.set(action + " — preview only");
  }
}
