import {
  booleanAttribute,
  Component,
  computed,
  contentChildren,
  ElementRef,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';

@Component({
  selector: 'button[mbToolbarButton]',
  template: '<ng-content />',
  styleUrl: './toolbar-button.css',
  host: {
    type: 'button',
    '[disabled]': 'disabled()',
    '[attr.data-density]': 'toolbar.density()',
    '[attr.aria-pressed]': 'pressed()',
    '[tabIndex]': 'toolbar.tabIndexFor(this)',
    '(focus)': 'toolbar.remember(this)',
  },
})
export class MbToolbarButton {
  readonly toolbar = inject(forwardRef(() => MbToolbar)) as MbToolbar;
  readonly element = inject<ElementRef<HTMLButtonElement>>(ElementRef);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly pressed = input<boolean | null>(null);
}

/** Button-only toolbar: one Tab stop, arrows move focus, native keys activate. */
@Component({
  selector: 'mb-toolbar',
  template: '<ng-content />',
  styleUrl: './toolbar.css',
  host: {
    role: 'toolbar',
    'aria-orientation': 'horizontal',
    '[attr.aria-label]': 'label()',
    '[attr.data-density]': 'density()',
    '[attr.data-embedded]': 'embedded()',
    '(keydown)': 'navigate($event)',
  },
})
export class MbToolbar {
  readonly label = input.required<string>();
  readonly density = input<'regular' | 'compact'>('regular');
  readonly embedded = input(false, { transform: booleanAttribute });
  readonly buttons = contentChildren(MbToolbarButton, { descendants: true });
  readonly enabled = computed(() =>
    this.buttons().filter((button) => button.toolbar === this && !button.disabled()),
  );
  private readonly lastFocused = signal<MbToolbarButton | null>(null);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  tabIndexFor(button: MbToolbarButton): number {
    const enabled = this.enabled();
    const current = this.lastFocused();
    return button === (current && enabled.includes(current) ? current : enabled[0]) ? 0 : -1;
  }

  remember(button: MbToolbarButton): void {
    this.lastFocused.set(button);
  }

  navigate(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const enabled = this.enabled();
    const current = enabled.findIndex((button) => button.element.nativeElement === event.target);
    if (current < 0) return;
    const rtl = getComputedStyle(this.element.nativeElement).direction === 'rtl';
    let next: number;
    switch (event.key) {
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = enabled.length - 1;
        break;
      case 'ArrowRight':
        next = (current + (rtl ? -1 : 1) + enabled.length) % enabled.length;
        break;
      case 'ArrowLeft':
        next = (current + (rtl ? 1 : -1) + enabled.length) % enabled.length;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.lastFocused.set(enabled[next]);
    enabled[next].element.nativeElement.focus();
  }
}
