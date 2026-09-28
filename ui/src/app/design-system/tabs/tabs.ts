import { NgTemplateOutlet } from '@angular/common';
import {
  booleanAttribute,
  Component,
  computed,
  contentChildren,
  Directive,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  TemplateRef,
} from '@angular/core';

@Directive({ selector: 'ng-template[mbTab]' })
export class MbTab {
  readonly value = input.required<string>();
  readonly label = input.required<string>();
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly template = inject(TemplateRef);
}

let nextId = 0;
/** Manual activation: arrows focus, Enter/Space select; route navigation uses links. */
@Component({
  selector: 'mb-tabs',
  imports: [NgTemplateOutlet],
  templateUrl: './tabs.html',
  styleUrl: './tabs.css',
})
export class MbTabs {
  readonly label = input.required<string>();
  readonly selected = input('');
  readonly selectedChange = output<string>();
  readonly tabs = contentChildren(MbTab);
  readonly selection = linkedSignal(() => this.selected());
  readonly active = computed(
    () =>
      this.tabs().find((tab) => tab.value() === this.selection() && !tab.disabled()) ??
      this.tabs().find((tab) => !tab.disabled()),
  );
  readonly focused = signal<MbTab | null>(null);
  readonly id = `mb-tabs-${nextId++}`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  tabIndexFor(tab: MbTab): number {
    const focused = this.focused();
    return tab ===
      (focused && this.tabs().includes(focused) && !focused.disabled() ? focused : this.active())
      ? 0
      : -1;
  }

  activate(tab: MbTab): void {
    if (tab.disabled()) return;
    this.selection.set(tab.value());
    this.selectedChange.emit(tab.value());
  }

  leave(event: FocusEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
      this.focused.set(null);
  }

  navigate(event: KeyboardEvent, tab: MbTab): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const enabled = this.tabs().filter((item) => !item.disabled());
    const index = enabled.indexOf(tab);
    if (index < 0) return;
    const rtl = getComputedStyle(this.host.nativeElement).direction === 'rtl';
    let next: number;
    switch (event.key) {
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = enabled.length - 1;
        break;
      case 'ArrowRight':
        next = (index + (rtl ? -1 : 1) + enabled.length) % enabled.length;
        break;
      case 'ArrowLeft':
        next = (index + (rtl ? 1 : -1) + enabled.length) % enabled.length;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.focused.set(enabled[next]);
    const originalIndex = this.tabs().indexOf(enabled[next]);
    this.host.nativeElement.querySelector<HTMLElement>(`#${this.id}-tab-${originalIndex}`)?.focus();
  }
}
