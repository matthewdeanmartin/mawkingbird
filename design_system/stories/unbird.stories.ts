import { type Meta, type StoryObj } from "@storybook/angular";
import { MbFileDrop } from "../../ui/src/app/design-system/file-drop/file-drop";
import { MbProgress } from "../../ui/src/app/design-system/progress/progress";
import {
  MbBarList,
  MbStatGrid,
} from "../../ui/src/app/design-system/stats/stats";

/**
 * The widgets added for Unbird (spec/sprint/unbird-2026-11.md, Sprint 5):
 * a file drop target, a labelled progress bar, a stat grid and a bar list.
 */
const meta: Meta = {
  title: "Data/File drop, progress and stats",
  tags: ["autodocs"],
};
export default meta;

export const FileDrop: StoryObj = {
  render: () => ({
    moduleMetadata: { imports: [MbFileDrop] },
    props: { picked: "" },
    template: `
      <mb-file-drop
        label="Drop your Twitter archive here"
        hint="The .zip file Twitter sent you. No need to unzip it."
        action="Choose the .zip…"
        accept=".zip"
        multiple
        (files)="picked = $event.length + ' picked: ' + $event[0].path"
      >
        <svg mbFileDropIcon width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M3 4h18v4H3zM5 8v12h14V8M12 11v6M9.5 14.5 12 17l2.5-2.5" />
        </svg>
      </mb-file-drop>
      <p style="margin-top: 12px">
        <mb-file-drop presentation="link" directory label="Already unzipped? Choose the folder" (files)="picked = $event.length + ' picked from a folder'" />
      </p>
      <p data-testid="picked">{{ picked || 'Nothing picked yet' }}</p>`,
  }),
};

export const FileDropBusy: StoryObj = {
  render: () => ({
    moduleMetadata: { imports: [MbFileDrop] },
    template: `<mb-file-drop label="Reading your follows, tweets and likes…" busy />`,
  }),
};

export const Progress: StoryObj = {
  render: () => ({
    moduleMetadata: { imports: [MbProgress] },
    template: `
      <mb-progress label="Searching mastodon.social…" caption="Checked 120 of 3,431, closest first" [value]="120" [max]="3431" />
      <div style="height: 16px"></div>
      <mb-progress label="Preparing" />`,
  }),
};

export const Stats: StoryObj = {
  render: () => ({
    moduleMetadata: { imports: [MbStatGrid, MbBarList] },
    props: {
      years: [
        { label: "2019", value: 2792, display: "2,792" },
        { label: "2020", value: 3787, display: "3,787" },
        { label: "2021", value: 2529, display: "2,529" },
        { label: "2022", value: 2611, display: "2,611" },
        { label: "2023", value: 240, display: "240" },
        { label: "2024", value: 0, display: "0" },
      ],
    },
    template: `
      <dl mbStatGrid>
        <div><dt>Your own posts</dt><dd>10,486</dd></div>
        <div><dt>Thread posts</dt><dd>1,916</dd></div>
        <div><dt>Replies to others</dt><dd>8,916</dd></div>
        <div><dt>Likes</dt><dd>21,468</dd></div>
      </dl>
      <h3>Posts per year</h3>
      <mb-bar-list label="Posts per year" [items]="years" />`,
  }),
};
