import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbToolbar, MbToolbarButton } from '../../design-system/toolbar/toolbar';

export type FilterBuilderMode = 'simple' | 'advanced';

// i18n filterBuilder.modeLabel: Filter builder
// i18n filterBuilder.simple: Simple
// i18n filterBuilder.advanced: Advanced

/**
 * Simple | Advanced at the top of the post's filter builder: the hashtag
 * picker, or adding this one post to a server filter. Shown only when the post
 * offers both.
 */
@Component({
  selector: 'app-filter-mode-switch',
  imports: [MbToolbar, MbToolbarButton, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<mb-toolbar density="compact" [label]="'filterBuilder.modeLabel' | transloco">
    @for (choice of modes; track choice) {
      <button
        type="button"
        mbToolbarButton
        [pressed]="mode() === choice"
        (click)="mode() !== choice && changed.emit(choice)"
      >
        {{ 'filterBuilder.' + choice | transloco }}
      </button>
    }
  </mb-toolbar>`,
  styles: `
    :host {
      display: block;
      margin-bottom: 12px;
    }
  `,
})
export class FilterModeSwitch {
  readonly mode = input.required<FilterBuilderMode>();
  readonly changed = output<FilterBuilderMode>();
  protected readonly modes: FilterBuilderMode[] = ['simple', 'advanced'];
}
