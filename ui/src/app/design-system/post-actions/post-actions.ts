import { Component, computed, inject, input, LOCALE_ID } from '@angular/core';
/** Mixed links/buttons retain native Tab order; no button-only roving-focus contract. */
@Component({
  selector: 'mb-post-actions',
  template: '<ng-content />',
  styleUrl: './post-actions.css',
  host: { role: 'group', '[attr.aria-label]': 'label()', '[attr.data-density]': 'density()' },
})
export class MbPostActions {
  readonly label = input.required<string>();
  readonly density = input<'default' | 'compact'>('default');
}
@Component({
  selector: 'button[mbPostAction], a[mbPostAction]',
  template: '<ng-content />',
  styleUrls: ['../toolbar/toolbar-button.css', './post-action.css'],
  host: {
    '[attr.aria-pressed]': 'pressed()',
    '[attr.data-active]': 'active() ? true : null',
    '[attr.data-tone]': 'tone()',
    '[attr.data-size]': 'size()',
  },
})
export class MbPostAction {
  readonly size = input<'default' | 'small'>('default');
  readonly tone = input<'default' | 'danger'>('default');
  readonly pressed = input<boolean | null>(null);
  /** Visual state for a menu trigger whose underlying action is active. */
  readonly active = input(false);
}
@Component({
  selector: 'span[mbActionCount]',
  template: `
    @if (count() !== null) {
      <span aria-hidden="true" [attr.title]="count()"
        >{{ formatted() }} <span class="label">{{ label() }}</span></span
      >
    }
    <span [class.exact]="count() !== null"><ng-content /></span>
  `,
  styleUrl: './action-count.css',
})
export class MbActionCount {
  readonly count = input<number | null>(null);
  readonly label = input('');
  readonly locale = input(inject(LOCALE_ID));
  private readonly formatter = computed(
    () => new Intl.NumberFormat(this.locale(), { notation: 'compact', maximumFractionDigits: 1 }),
  );
  readonly formatted = computed(() => this.formatter().format(this.count() ?? 0));
}

@Component({
  selector: 'span[mbPostActionLabel]',
  template: '<ng-content />',
  styleUrl: './post-action-label.css',
})
export class MbPostActionLabel {}
