import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbDialog } from '../../design-system/dialog/dialog';
import { ENGLISH_TOOLS, FOCUSED_TOOL_GROUPS } from '../../public-pages/focused-tools';

// i18n toolsMenu.title: Tools
// i18n toolsMenu.close: Close
// i18n toolsMenu.all: Every tool, with what it does

/**
 * The … menu's Tools row (owner, 2026-11-27): the focused tool pages, which
 * search visitors land on but the app's own nav barely reached. Modelled on
 * Even more, one flat dialog of links, grouped as on /tools. A signed-in reader
 * gets each tool's shell twin at the same path.
 *
 * The groups and titles are the English registry's, like /tools: tool pages are
 * translated per page, not through the UI locale.
 */
@Component({
  selector: 'app-tools-menu',
  imports: [MbDialog, RouterLink, TranslocoPipe],
  template: `
    <mb-dialog
      [title]="'toolsMenu.title' | transloco"
      [closeLabel]="'toolsMenu.close' | transloco"
      [closeOnBackdrop]="true"
      [returnFocusTo]="returnFocusTo()"
      (dismissed)="closed.emit()"
    >
      @for (group of groups; track group.id) {
        <section class="tm-section">
          <h3>{{ group.title }}</h3>
          <ul class="tm-links">
            @for (tool of group.tools; track tool.id) {
              <li>
                <a [routerLink]="'/' + tool.path" (click)="closed.emit()">{{ tool.title }}</a>
              </li>
            }
          </ul>
        </section>
      }
      <p class="tm-all">
        <a routerLink="/tools" (click)="closed.emit()">{{ 'toolsMenu.all' | transloco }}</a>
      </p>
    </mb-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .tm-section + .tm-section {
      margin-top: 1rem;
    }
    h3 {
      font-size: 0.95rem;
      margin: 0 0 0.4rem;
    }
    .tm-links {
      columns: 2 12rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .tm-links li {
      break-inside: avoid;
      padding: 0.2rem 0;
    }
    .tm-all {
      margin: 1rem 0 0;
    }
  `,
})
export class ToolsMenu {
  readonly returnFocusTo = input<HTMLElement | null>(null);
  readonly closed = output<void>();

  protected readonly groups = FOCUSED_TOOL_GROUPS.map((group) => ({
    ...group,
    tools: ENGLISH_TOOLS.filter((tool) => tool.group === group.id),
  })).filter((group) => group.tools.length);
}
