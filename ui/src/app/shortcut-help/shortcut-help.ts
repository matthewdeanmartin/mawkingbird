import { Component, computed, inject, output } from '@angular/core';
import { AnonymousCapabilities } from '../providers/anonymous/anonymous-capabilities';
import { FocusTrap } from '../a11y/focus-trap';

interface ShortcutRow {
  keys: string[];
  label: string;
}

interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

/** Which keys do what — layout and bindings match mastodon.social's "?" dialog. */
const GROUPS: ShortcutGroup[] = [
  {
    title: 'Composing',
    rows: [
      { keys: ['n'], label: 'Start a new post' },
      { keys: ['alt', 'n'], label: 'Start a new post from anywhere' },
      { keys: ['ctrl', 'enter'], label: 'Send post' },
      { keys: ['alt', 'x'], label: 'Show/hide content warning field' },
    ],
  },
  {
    title: 'Timeline',
    rows: [
      { keys: ['j'], label: 'Move down in the list' },
      { keys: ['k'], label: 'Move up in the list' },
      { keys: ['0'], label: 'Jump to the first post' },
      { keys: ['l'], label: 'Focus "Load more"' },
      { keys: ['r'], label: 'Reply to focused post' },
      { keys: ['m'], label: 'Mention the author' },
      { keys: ['f'], label: 'Favourite focused post' },
      { keys: ['b'], label: 'Boost focused post' },
      { keys: ['q'], label: 'Quote focused post' },
      { keys: ['enter', 'o'], label: 'Open focused post' },
      { keys: ['p'], label: "Open author's profile" },
      { keys: ['e'], label: 'Open media' },
    ],
  },
  {
    title: 'Navigation',
    rows: [
      { keys: ['s', '/'], label: 'Search' },
      { keys: ['backspace'], label: 'Go back' },
      { keys: ['g', 'h'], label: 'Home' },
      { keys: ['g', 'n'], label: 'Notifications' },
      { keys: ['g', 'e'], label: 'Explore' },
      { keys: ['g', 'l'], label: 'Public timeline' },
      { keys: ['g', 'd'], label: 'Direct messages' },
      { keys: ['g', 'f'], label: 'Likes' },
      { keys: ['g', 'u'], label: 'Your profile' },
      { keys: ['g', 'b'], label: 'Blocked users' },
      { keys: ['g', 'm'], label: 'Muted users' },
      { keys: ['?'], label: 'This help' },
    ],
  },
];

/** The "?" keyboard shortcuts cheat-sheet, bindings identical to mastodon.social. */
@Component({
  selector: 'app-shortcut-help',
  imports: [FocusTrap],
  template: `
    <div
      class="overlay"
      role="presentation"
      tabindex="-1"
      (click)="closed.emit()"
      (keyup.escape)="closed.emit()"
    >
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
        appFocusTrap
        (dismissed)="closed.emit()"
        (click)="$event.stopPropagation()"
        (keyup)="$event.stopPropagation()"
      >
        <h3 id="shortcut-help-title">Keyboard shortcuts</h3>
        <p class="muted note">Same bindings as mastodon.social — nothing new to memorize.</p>
        <div class="groups">
          @for (group of groups(); track group.title) {
            <section>
              <h4>{{ group.title }}</h4>
              <table>
                <tbody>
                  @for (row of group.rows; track row.label) {
                    <tr>
                      <td class="keys">
                        @for (key of row.keys; track key; let last = $last) {
                          <kbd>{{ key }}</kbd>
                          @if (!last) {
                            <span class="plus">+</span>
                          }
                        }
                      </td>
                      <td>{{ row.label }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </section>
          }
        </div>
        <div class="actions">
          <button class="btn btn-outline" type="button" (click)="closed.emit()">Close</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 110;
      padding: 16px;
    }
    .dialog {
      background: var(--col-bg);
      border-radius: 16px;
      padding: 24px;
      width: 720px;
      max-width: 100%;
      max-height: 85vh;
      overflow-y: auto;
    }
    h3 {
      margin: 0 0 4px;
    }
    .note {
      margin: 0 0 16px;
      font-size: 0.9em;
    }
    .groups {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }
    h4 {
      margin: 0 0 8px;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      font-size: 0.9em;
    }
    td {
      padding: 3px 8px 3px 0;
      vertical-align: top;
    }
    .keys {
      white-space: nowrap;
    }
    kbd {
      border: 1px solid var(--border);
      border-bottom-width: 2px;
      border-radius: 4px;
      padding: 1px 6px;
      font-family: inherit;
      font-size: 0.9em;
    }
    .plus {
      margin: 0 2px;
      opacity: 0.6;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
    }
  `,
})
export class ShortcutHelp {
  readonly closed = output<void>();
  private capabilities = inject(AnonymousCapabilities);
  protected readonly groups = computed(() => {
    if (!this.capabilities.active) {
      return GROUPS;
    }
    const hidden = new Set([
      'Reply to focused post',
      'Mention the author',
      'Favourite focused post',
      'Boost focused post',
      'Quote focused post',
      'Notifications',
      'Direct messages',
      'Likes',
      'Blocked users',
      'Muted users',
    ]);
    return GROUPS.filter((group) => group.title !== 'Composing').map((group) => ({
      ...group,
      rows: group.rows.filter((row) => !hidden.has(row.label)),
    }));
  });
}
