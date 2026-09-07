import { Component, inject } from '@angular/core';
import { ClientPrefs, ReaderFontFamily, ReaderTheme, READER_FONT_OPTIONS } from '../client-prefs';

/** The complete set of controls available while reading long-form content. */
@Component({
  selector: 'app-reader-toolbar',
  template: `
    <div class="reader-toolbar" role="toolbar" aria-label="Reader controls">
      <button class="btn reader-item" type="button" (click)="bumpFont(-1)" title="Smaller text">
        A−
      </button>
      <span class="reader-size" aria-live="polite">{{ prefs.readerFontSize() }}px</span>
      <button class="btn reader-item" type="button" (click)="bumpFont(1)" title="Larger text">
        A+
      </button>

      <select
        class="reader-select"
        aria-label="Font family"
        title="Font family"
        [value]="prefs.readerFontFamily()"
        (change)="setFontFamily($event)"
      >
        @for (font of readerFonts; track font.id) {
          <option [value]="font.id">{{ font.label }}</option>
        }
      </select>

      <select
        class="reader-select"
        aria-label="Article theme"
        title="Article theme — colours the feed only"
        [value]="prefs.readerTheme()"
        (change)="setTheme($event)"
      >
        <option value="app">Match app</option>
        <option value="light">Light</option>
        <option value="sepia">Sepia</option>
        <option value="dark">Dark</option>
        <option value="solarized">Solarized</option>
      </select>
    </div>
  `,
  styleUrl: './reader-toolbar.css',
})
export class ReaderToolbar {
  protected readonly prefs = inject(ClientPrefs);
  protected readonly readerFonts = READER_FONT_OPTIONS;

  protected bumpFont(delta: number): void {
    this.prefs.setReaderFontSize(this.prefs.readerFontSize() + delta);
  }

  protected setFontFamily(event: Event): void {
    this.prefs.setReaderFontFamily((event.target as HTMLSelectElement).value as ReaderFontFamily);
  }

  protected setTheme(event: Event): void {
    this.prefs.setReaderTheme((event.target as HTMLSelectElement).value as ReaderTheme);
  }
}
