import { Component, computed, input, output, signal } from "@angular/core";
import { type Meta, type StoryObj } from "@storybook/angular";
import {
  MbPostAction,
  MbPostActions,
} from "../../ui/src/app/design-system/post-actions/post-actions";
import { MbPostMenu } from "../../ui/src/app/design-system/menu/post-menu";
import { MbMenuItem } from "../../ui/src/app/design-system/menu/menu-item";
import { MbMenuGroup } from "../../ui/src/app/design-system/menu/menu-group";
import { MbMenuSeparator } from "../../ui/src/app/design-system/menu/menu-separator";
import {
  MbToolbar,
  MbToolbarButton,
} from "../../ui/src/app/design-system/toolbar/toolbar";

type Kind = "Other's post" | "Own post" | "No server actions";
const fewTags = ["pizza", "cooking"];
const manyTags = [
  "pizza",
  "cooking",
  "sourdough",
  "neapolitan",
  "ovens",
  "fermentation",
  "weeknightdinners",
];

let nextId = 0;

/** One sample post: the ••• menu mirrors StatusCard's three legacy variants. */
@Component({
  selector: "ds-review-nineteen-post",
  imports: [
    MbPostActions,
    MbPostAction,
    MbPostMenu,
    MbMenuItem,
    MbMenuGroup,
    MbMenuSeparator,
  ],
  template: `
    <article
      [attr.aria-label]="heading()"
      (click)="logged.emit('Opened thread')"
    >
      <p class="who">
        <strong>Pizza Fan</strong> <span>&#64;pizza&#64;social.example</span>
      </p>
      <p>
        Fourth attempt at a long cold ferment. The crust finally blistered.
        @for (tag of tags(); track tag) {
          <span class="tag">#{{ tag }}</span>
        }
      </p>
      <mb-post-actions
        label="Actions for this post"
        density="compact"
        narrowAlign="end"
      >
        <button type="button" mbPostAction aria-label="Reply">💬</button>
        <button type="button" mbPostAction aria-label="Boost">🔁</button>
        <button type="button" mbPostAction aria-label="Like">⭐</button>
        <mb-post-menu
          label="More actions for this post"
          closeLabel="Close menu"
          (openedChange)="logged.emit($event ? 'Menu opened' : 'Menu closed')"
        >
          @if (tags().length > 4) {
            <button
              type="button"
              mbMenuItem
              [expanded]="tagsOpen()"
              [attr.aria-controls]="listId"
              (click)="tagsOpen.set(!tagsOpen())"
            >
              Mute a hashtag ({{ tags().length }})
            </button>
            @if (tagsOpen()) {
              <mb-menu-group nested [id]="listId">
                @for (tag of tags(); track tag) {
                  <button
                    type="button"
                    mbMenuItem
                    (click)="logged.emit('Mute #' + tag)"
                  >
                    Mute #{{ tag }}…
                  </button>
                }
              </mb-menu-group>
            }
          } @else {
            @for (tag of tags(); track tag) {
              <button
                type="button"
                mbMenuItem
                (click)="logged.emit('Mute #' + tag)"
              >
                Mute #{{ tag }}…
              </button>
            }
          }
          <button
            type="button"
            mbMenuItem
            [pressed]="liked()"
            (click)="liked.set(!liked())"
          >
            {{ liked() ? "Remove private like" : "Private like" }}
          </button>
          <button
            type="button"
            mbMenuItem
            (click)="logged.emit('Saved as to-do')"
          >
            Save as to-do
          </button>
          <a
            mbMenuItem
            href="https://social.example/@pizza/1"
            target="_blank"
            rel="noopener noreferrer"
            >Open post on original site ↗</a
          >
          <a
            mbMenuItem
            href="https://social.example/@pizza"
            target="_blank"
            rel="noopener noreferrer"
            >Open profile on original site ↗</a
          >
          @if (kind() !== "Own post") {
            <mb-menu-separator />
            <button
              type="button"
              mbMenuItem
              tone="danger"
              (click)="logged.emit('Muted this post')"
            >
              Mute this post
            </button>
            @if (muted()) {
              <button
                type="button"
                mbMenuItem
                (click)="muted.set(false); logged.emit('Unmuted @pizza')"
              >
                Unmute &#64;pizza&#64;social.example
              </button>
            } @else {
              <mb-menu-group
                label="Mute @pizza@social.example for"
                layout="inline"
              >
                @for (d of durations; track d) {
                  <button
                    type="button"
                    mbMenuItem
                    (click)="muted.set(true); logged.emit('Muted for ' + d)"
                  >
                    {{ d }}
                  </button>
                }
              </mb-menu-group>
              <button
                type="button"
                mbMenuItem
                tone="danger"
                (click)="logged.emit('Blocked @pizza')"
              >
                Block &#64;pizza&#64;social.example
              </button>
            }
            @if (kind() === "Other's post") {
              <button
                type="button"
                mbMenuItem
                tone="danger"
                (click)="logged.emit('Report opened')"
              >
                Report post
              </button>
            }
          }
        </mb-post-menu>
      </mb-post-actions>
    </article>
  `,
  styles: `
    article {
      padding: 12px 16px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--col-bg);
      cursor: pointer;
      overflow-wrap: anywhere;
    }
    .who span,
    .tag {
      color: var(--muted);
    }
    .tag {
      margin-inline-start: 0.3em;
    }
  `,
})
class ReviewPost {
  readonly heading = input.required<string>();
  readonly kind = input.required<Kind>();
  readonly tags = input.required<string[]>();
  readonly muted = signal(false);
  readonly liked = signal(false);
  readonly tagsOpen = signal(false);
  readonly durations = ["1 hour", "1 day", "7 days", "Forever"];
  readonly listId = `review-19-tags-${nextId++}`;
  readonly logged = output<string>();
}

@Component({
  selector: "ds-review-nineteen",
  imports: [ReviewPost, MbToolbar, MbToolbarButton],
  template: `
    <h1>Post ••• menu.</h1>
    <p>
      Shared widgets only: the app's StatusCard keeps its legacy menu until this
      preview is reviewed. Nothing here posts, mutes or stores anything; actions
      are written to the log below.
    </p>
    <mb-toolbar label="Preview scenarios">
      @for (mode of kinds; track mode) {
        <button
          mbToolbarButton
          type="button"
          [pressed]="kind() === mode"
          (click)="kind.set(mode)"
        >
          {{ mode }}
        </button>
      }
      <button
        mbToolbarButton
        type="button"
        [pressed]="many()"
        (click)="many.set(!many())"
      >
        7 hashtags
      </button>
    </mb-toolbar>
    <p data-log aria-live="polite">Last action: {{ last() }}</p>
    <ds-review-nineteen-post
      heading="Sample post"
      [kind]="kind()"
      [tags]="tags()"
      (logged)="last.set($event)"
    />
    <div class="spacer" aria-hidden="true"></div>
    <ds-review-nineteen-post
      heading="Post near the bottom of the screen"
      [kind]="kind()"
      [tags]="tags()"
      (logged)="last.set($event)"
    />
  `,
  styles: `
    :host {
      display: block;
      max-width: 600px;
    }
    .spacer {
      height: 70vh;
    }
  `,
})
class PostMenuReview {
  readonly kinds: Kind[] = ["Other's post", "Own post", "No server actions"];
  readonly kind = signal<Kind>("Other's post");
  readonly many = signal(false);
  readonly tags = computed(() => (this.many() ? manyTags : fewTags));
  readonly last = signal("none");
}

export default {
  title: "Start here/Sprint 19 review",
  component: PostMenuReview,
} satisfies Meta<PostMenuReview>;
export const PostMenu: StoryObj<PostMenuReview> = {};
