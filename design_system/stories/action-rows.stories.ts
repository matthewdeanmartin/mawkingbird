import {
  applicationConfig,
  type Meta,
  type StoryObj,
} from "@storybook/angular";
import { Component, ChangeDetectionStrategy } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { provideRouter, RouterLink, withHashLocation } from "@angular/router";
import { MbAddBox } from "../../ui/src/app/design-system/add-box/add-box";
import { MbButton } from "../../ui/src/app/design-system/button/button";
import { MbControl, MbField } from "../../ui/src/app/design-system/field/field";
import { MbIcon } from "../../ui/src/app/design-system/icon/icon";
import {
  ICON_PATHS,
  type MbIconName,
} from "../../ui/src/app/design-system/icon/icon-paths";
import {
  type MbItemAction,
  MbItemActions,
} from "../../ui/src/app/design-system/item-actions/item-actions";
import {
  MbItemList,
  MbItemMeta,
  MbItemPicture,
  MbItemRow,
  MbItemTitle,
} from "../../ui/src/app/design-system/item-list/item-list";
import { MbPageHeader } from "../../ui/src/app/design-system/page-header/page-header";
import {
  MbPagePanel,
  MbRailPage,
  MbRailPanel,
} from "../../ui/src/app/design-system/rail-page/rail-page";
import {
  MbToolbar,
  MbToolbarButton,
} from "../../ui/src/app/design-system/toolbar/toolbar";

const picture =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="56"><rect width="100" height="56" fill="#46535e"/></svg>',
  );

@Component({
  selector: "ds-action-rows",
  imports: [
    FormsModule,
    RouterLink,
    MbAddBox,
    MbButton,
    MbControl,
    MbField,
    MbIcon,
    MbItemActions,
    MbItemList,
    MbItemMeta,
    MbItemPicture,
    MbItemRow,
    MbItemTitle,
    MbPageHeader,
    MbPagePanel,
    MbRailPage,
    MbRailPanel,
    MbToolbar,
    MbToolbarButton,
  ],
  template: `
    <mb-rail-page>
      <aside mbRailPanel>
        <mb-page-header embedded title="Subscriptions" />
        <form mbAddBox (ngSubmit)="sent = sent + 1">
          <mb-field
            label="YouTube channel link, @handle or channel ID"
            hint="Nothing is sent to YouTube until you add it."
          >
            <input mbControl name="channel" [(ngModel)]="channel" />
          </mb-field>
          <button mbButton type="submit" aria-label="Subscribe">
            <mb-icon name="add" />
          </button>
        </form>
        <p role="status">Added {{ sent }}</p>
        <form mbAddBox>
          <mb-field label="With a word">
            <input mbControl name="word" [(ngModel)]="word" />
          </mb-field>
          <button mbButton type="submit">Suchergebnisse</button>
        </form>
      </aside>
      <section mbPagePanel>
        <h2>Rows</h2>
        <ol mbItemList>
          @for (title of titles; track title; let i = $index) {
            <li mbItemRow>
              @if (i === 0) {
                <mb-item-picture shape="wide" [src]="picture" link="/watch" />
              }
              <a mbItemTitle routerLink="/watch">{{ title }}</a>
              <span mbItemMeta>YouTube</span>
              <mb-toolbar density="compact" embedded [label]="title">
                <button
                  mbToolbarButton
                  aria-label="Move up"
                  [disabled]="i === 0"
                >
                  <mb-icon name="up" />
                </button>
                <button mbToolbarButton aria-label="Move down">
                  <mb-icon name="down" />
                </button>
                <button mbToolbarButton aria-label="Remove">
                  <mb-icon name="remove" />
                </button>
              </mb-toolbar>
            </li>
          }
        </ol>
        <h2>Actions</h2>
        <mb-item-actions
          class="feed"
          iconsWhenNarrow
          label="Video actions"
          [actions]="actions"
        />
        <h2>Icons</h2>
        <p class="icons">
          @for (name of icons; track name) {
            <span><mb-icon [name]="name" /> {{ name }}</span>
          }
        </p>
      </section>
    </mb-rail-page>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .icons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
    }
  `,
})
class ActionRowsReview {
  readonly picture = picture;
  readonly icons = Object.keys(ICON_PATHS) as MbIconName[];
  readonly titles = [
    "How lamps work",
    "Donaudampfschifffahrtselektrizitätenhauptbetriebswerkbauunterbeamtengesellschaft",
  ];
  readonly actions: MbItemAction[] = [
    { id: "watch", icon: "people", label: "Watch Party", link: "/watch" },
    { id: "queue", icon: "queue", label: "In queue", pressed: true },
    { id: "save", icon: "save", label: "Save for later", pressed: false },
    { id: "reply", icon: "reply", label: "Post Response" },
    { id: "full", icon: "queue", label: "Queue full", disabled: true },
    {
      id: "open",
      icon: "open",
      label: "Open on YouTube",
      href: "https://example.com/",
    },
  ];
  channel = "";
  word = "";
  sent = 0;
}

export default {
  title: "Actions/Action rows",
  component: ActionRowsReview,
  decorators: [
    applicationConfig({
      providers: [provideRouter([], withHashLocation())],
    }),
  ],
} satisfies Meta<ActionRowsReview>;
export const Patterns: StoryObj<ActionRowsReview> = {};
