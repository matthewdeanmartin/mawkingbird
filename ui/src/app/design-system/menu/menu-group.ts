import { booleanAttribute, Component, input } from '@angular/core';

let nextId = 0;
/** Related menu rows under an optional visible caption, which also names the group. */
@Component({
  selector: 'mb-menu-group',
  template: `@if (label()) {
      <span class="caption" [id]="captionId">{{ label() }}</span>
    }
    <div class="items"><ng-content /></div>`,
  styleUrl: './menu-group.css',
  host: {
    role: 'group',
    '[attr.aria-labelledby]': 'label() ? captionId : null',
    '[attr.data-layout]': 'layout()',
    '[attr.data-nested]': 'nested() || null',
  },
})
export class MbMenuGroup {
  readonly label = input<string | null>(null);
  /** `inline` lays rows out as compact wrapping choices, e.g. mute durations. */
  readonly layout = input<'stack' | 'inline'>('stack');
  /** Indented and height-bounded: a long list revealed by an `expanded` row. */
  readonly nested = input(false, { transform: booleanAttribute });
  protected readonly captionId = `mb-menu-group-${nextId++}`;
}
