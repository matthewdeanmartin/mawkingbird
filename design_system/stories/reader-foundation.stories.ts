import { moduleMetadata, type Meta, type StoryObj } from "@storybook/angular";
import {
  MbReaderLibrary,
  MbReaderPreferences,
  MbReaderSearch,
  MbReaderSurface,
} from "../../ui/src/app/design-system/reader/reader";
import { MbPostAction } from "../../ui/src/app/design-system/post-actions/post-actions";

export default {
  title: "Reader/Presentation",
  decorators: [
    moduleMetadata({
      imports: [
        MbReaderLibrary,
        MbReaderPreferences,
        MbReaderSearch,
        MbReaderSurface,
        MbPostAction,
      ],
    }),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Existing reader presentation, extracted without redesign. These projected native elements own appearance only. The reader still owns positioning, translation, fields, navigation, search and selection. Adoption / Reader controls exercises the real components together.",
      },
    },
  },
} satisfies Meta;

export const Preferences: StoryObj = {
  render: () => ({
    template: `
      <div mbReaderPreferences style="display: grid; gap: 6px; padding: 10px; max-width: 52rem">
        <label class="typo-row">
          <span class="typo-label">Typeface</span>
          <select><option>Georgia</option><option>Monospace</option></select>
        </label>
        <label class="typo-row">
          <span class="typo-label">Line height</span>
          <input type="range" min="1.2" max="2.2" step="0.05" value="1.6" />
        </label>
        <label class="typo-row typo-stack">
          <span class="typo-label">Dictionary address</span>
          <input type="url" value="not a dictionary" aria-invalid="true" aria-describedby="dictionary-error" />
          <span id="dictionary-error">Enter an https address containing &#123;word&#125;.</span>
        </label>
      </div>
    `,
  }),
};

export const Library: StoryObj = {
  render: () => ({
    template: `
      <aside mbReaderLibrary aria-label="Library" style="width: min(100%, 290px)">
        <header class="library-head"><h2>Library</h2></header>
        <nav class="library-body" aria-label="Reading library">
          <button type="button" class="rail-row rail-folder" aria-expanded="true"><span>Still reading</span><span>1</span></button>
          <div class="row-wrap active">
            <a class="rail-row rail-feed nested" href="#example" aria-current="true">
              <span class="names"><span class="name">A quiet reading session</span><span class="muted small">example.com</span></span>
              <span class="progress small">1 / 3</span>
            </a>
          </div>
        </nav>
        <footer class="library-foot"><span class="muted small">One saved document</span></footer>
      </aside>
    `,
  }),
};

export const Search: StoryObj = {
  render: () => ({
    template: `
      <div mbReaderSearch role="dialog" aria-label="Find in document" style="max-width: 34rem; padding: 10px 12px">
        <div style="display: flex; gap: 8px; align-items: center">
          <input type="search" class="search-field" aria-label="Find in document" value="quiet" />
          <button mbPostAction size="small" type="button">Close</button>
        </div>
        <p role="status">2 matches</p>
        <button class="search-result on-this-page" type="button">
          <span class="search-context">A <mark>quiet</mark> reading session</span><span class="search-page">Page 1</span>
        </button>
        <button class="search-result" type="button">
          <span class="search-context">Another <mark>quiet</mark> passage</span><span class="search-page">Page 3</span>
        </button>
      </div>
    `,
  }),
};

export const Surfaces: StoryObj = {
  render: () => ({
    template: `
      <aside mbReaderSurface aria-label="Notes" style="padding: 10px 12px; max-width: 15rem">Notes remain beside the reading measure, not inside it.</aside>
      <div mbReaderSurface surface="selection" role="toolbar" aria-label="Selection tools" style="display: flex; flex-wrap: wrap; gap: 2px; padding: 3px; width: max-content; max-width: 100%; margin-top: 16px">
        <button mbPostAction size="small" type="button">Highlight</button>
        <button mbPostAction size="small" type="button">Note</button>
        <button mbPostAction size="small" type="button">Share</button>
      </div>
    `,
  }),
};
