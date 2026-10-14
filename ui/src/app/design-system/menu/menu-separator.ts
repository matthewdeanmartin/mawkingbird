import { Component } from '@angular/core';

/** A rule between sections of a menu. */
@Component({
  selector: 'mb-menu-separator',
  template: '',
  styles: `
    :host {
      display: block;
      margin: 4px 6px;
      border-top: 1px solid var(--border);
    }
  `,
  host: { role: 'separator' },
})
export class MbMenuSeparator {}
