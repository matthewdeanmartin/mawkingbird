import { booleanAttribute, Component, inject, input } from '@angular/core';

/** Native links retain href/routerLink behavior and normal Tab navigation. */
@Component({
  selector: 'nav[mbNavigation]',
  template: '<ng-content />',
  styleUrl: './navigation.css',
  host: { '[attr.aria-label]': 'label()', '[attr.data-presentation]': 'presentation()' },
})
export class MbNavigation {
  readonly label = input.required<string>();
  readonly presentation = input<'rows' | 'tabs'>('rows');
}

@Component({
  selector: 'a[mbNavLink]',
  template: '<ng-content />',
  styleUrl: './nav-link.css',
  host: {
    '[attr.aria-current]': 'current() ? "page" : null',
    '[attr.data-presentation]': 'navigation.presentation()',
  },
})
export class MbNavLink {
  readonly navigation = inject(MbNavigation);
  readonly current = input(false, { transform: booleanAttribute });
}
