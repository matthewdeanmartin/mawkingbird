import { Component, computed, input } from '@angular/core';

// 24×24 outline glyphs. Decorative only: the owning button carries the
// accessible name, so the icon is always aria-hidden.
const PATHS = {
  previous: 'M6 5v14M19 5 9 12l10 7Z',
  play: 'M7 4.5v15L19.5 12Z',
  pause: 'M8 5v14M16 5v14',
  next: 'M18 5v14M5 5l10 7-10 7Z',
  stop: 'M6 6l12 12M18 6 6 18',
  expand: 'M5 15l7-7 7 7',
  fullscreen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  exitFullscreen: 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  remove: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  open: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  load: 'M12 4v8M7.5 6.5a7 7 0 1 0 9 0',
  close: 'M5 12h14',
  list: 'M4 6h16M4 12h16M4 18h10',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  share: 'M4 13v7h16v-7M12 3v12M7 8l5-5 5 5',
} as const;
export type RadioIconName = keyof typeof PATHS;

@Component({
  selector: 'app-radio-icon',
  template: `<svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    aria-hidden="true"
    focusable="false"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path [attr.d]="path()" [attr.fill]="filled() ? 'currentColor' : null" />
  </svg>`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
  `,
})
export class RadioIcon {
  readonly name = input.required<RadioIconName>();
  readonly path = computed(() => PATHS[this.name()]);
  readonly filled = computed(() => this.name() === 'play');
}
