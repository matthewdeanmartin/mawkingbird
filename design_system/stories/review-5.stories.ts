import { PowerPost } from "../fixtures/power-post";
import { Component, input, signal } from "@angular/core";
import { type Meta, type StoryObj } from "@storybook/angular";
import {
  MbMetadata,
  MbContentLink,
} from "../../ui/src/app/design-system/metadata/metadata";
import { MbBadge } from "../../ui/src/app/design-system/badge/badge";
import { MbContentState } from "../../ui/src/app/design-system/content-state/content-state";
import {
  MbToolbar,
  MbToolbarButton,
} from "../../ui/src/app/design-system/toolbar/toolbar";
import { MbButton } from "../../ui/src/app/design-system/button/button";

@Component({
  selector: "mb-content-review",
  imports: [
    PowerPost,
    MbMetadata,
    MbContentLink,
    MbBadge,
    MbContentState,
    MbToolbar,
    MbToolbarButton,
    MbButton,
  ],
  template: `
    <article class="ds-sheet">
      <h1>Content that stays readable.</h1>
      <p class="ds-intro">
        Sprint 5 · Compact actions, quiet metadata and clear next steps.
      </p>
      <section class="ds-section">
        <h2>A dense post, with room for the content</h2>
        <article class="ds-content-card" aria-label="Preview post">
          <mb-metadata>
            <a mbContentLink href="#account-preview"
              ><strong>{{
                longText()
                  ? "Alexandra With An Exceptionally Long Display Name"
                  : "Alex Rivera"
              }}</strong></a
            >
            <span dir="auto">{{
              longText()
                ? "@averylongunbrokenaccountname@community.example"
                : "@alex@community.example"
            }}</span>
            <a mbContentLink href="#post-preview"
              ><time datetime="2026-09-27T14:30:00Z">27 Sep, 14:30</time></a
            >
            <mb-badge>Pinned</mb-badge><mb-badge>Public</mb-badge>
          </mb-metadata>
          <p class="ds-content-copy">
            A good reading surface keeps the words in charge. Actions stay close
            at hand without becoming another row of pill-shaped buttons.
          </p>
          <mb-toolbar label="Post actions" density="compact" embedded>
            <button
              mbToolbarButton
              aria-label="Reply, 3 replies"
              (click)="result.set('Reply preview opened')"
            >
              <span aria-hidden="true">↩</span><span>3</span>
            </button>
            <button
              mbToolbarButton
              aria-label="Boost unavailable in this preview"
              disabled
            >
              <span aria-hidden="true">↻</span><span>12</span>
            </button>
            <button
              mbToolbarButton
              aria-label="Favorite"
              [pressed]="favorite()"
              (click)="favorite.set(!favorite())"
            >
              <span aria-hidden="true">☆</span
              ><span>{{ favorite() ? 25 : 24 }}</span>
            </button>
            <button
              mbToolbarButton
              aria-label="Bookmark"
              title="Bookmark"
              [pressed]="bookmarked()"
              (click)="bookmarked.set(!bookmarked())"
            >
              <span aria-hidden="true">⚑</span>
            </button>
            <button
              mbToolbarButton
              (click)="result.set('Reader preview opened')"
            >
              Open reader
            </button>
          </mb-toolbar>
          <p class="ds-content-feedback" role="status">{{ result() }}</p>
        </article>
      </section>
      <section class="ds-section">
        <h2>All tools, large counts</h2>
        <ds-power-post />
      </section>
      <section class="ds-section">
        <h2>Loading, empty and retry states</h2>
        <div class="ds-stack">
          <mb-content-state
            kind="loading"
            title="Loading older posts…"
            description="Your current posts stay in place while more are fetched."
          />
          <mb-content-state
            title="You’re all caught up"
            description="New posts will appear here. You can also explore another feed."
          >
            <a mbContentLink href="#feed-preview">Explore feeds</a>
          </mb-content-state>
          <mb-content-state
            [kind]="retry() ? 'empty' : 'error'"
            [title]="
              retry() ? 'Connection restored' : 'Could not load older posts'
            "
            [description]="
              retry()
                ? 'Your place in the feed has been kept.'
                : 'Your current posts are still available. Try again when you are ready.'
            "
            [announcement]="retry() ? 'status' : 'off'"
          >
            <button
              mbButton
              variant="outline"
              size="small"
              [disabled]="retry()"
              (click)="retry.set(true)"
            >
              Try again
            </button>
          </mb-content-state>
          <mb-content-state
            title="Keine weiteren Beiträge in dieser Ansicht"
            description="Wählen Sie einen anderen Feed oder ändern Sie Ihre Filter, um weitere Beiträge anzuzeigen."
          />
        </div>
      </section>
      <section class="ds-section" id="account-preview">
        <h2>Small informational badges</h2>
        <mb-metadata
          ><mb-badge>RSS</mb-badge><mb-badge>Edited</mb-badge
          ><mb-badge tone="attention">Content warning</mb-badge
          ><span>Labels convey their meaning in words.</span></mb-metadata
        >
      </section>
      <p id="post-preview">Post link destination (preview only).</p>
      <p id="feed-preview">Feed link destination (preview only).</p>
    </article>
  `,
})
class ContentReview {
  readonly longText = input(false);
  readonly favorite = signal(false);
  readonly bookmarked = signal(false);
  readonly retry = signal(false);
  readonly result = signal("");
}
const meta: Meta<ContentReview> = {
  title: "Start here/Sprint 5 review",
  component: ContentReview,
};
export default meta;
type Story = StoryObj<ContentReview>;
export const Review: Story = {};
export const LongNames: Story = { args: { longText: true } };
