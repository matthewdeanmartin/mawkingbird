import { Component, input } from '@angular/core';
/** Mixed links/buttons retain native Tab order; no button-only roving-focus contract. */
@Component({
  selector: 'mb-post-actions',
  template: '<ng-content />',
  styleUrl: './post-actions.css',
  host: { role: 'group', '[attr.aria-label]': 'label()' },
})
export class MbPostActions {
  readonly label = input.required<string>();
}
@Component({
  selector: 'button[mbPostAction], a[mbPostAction]',
  template: '<ng-content />',
  styleUrls: ['../toolbar/toolbar-button.css', './post-action.css'],
  host: { '[attr.aria-pressed]': 'pressed()' },
})
export class MbPostAction {
  readonly pressed = input<boolean | null>(null);
}
@Component({
  selector: 'span[mbActionCount]',
  template: '<ng-content />',
  styleUrl: './action-count.css',
})
export class MbActionCount {}
