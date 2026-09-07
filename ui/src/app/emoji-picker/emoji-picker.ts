import { Component, effect, ElementRef, inject, OnDestroy, output, viewChild } from '@angular/core';
import { ClientPrefs } from '../client-prefs';
import { CustomEmojis } from '../custom-emojis';

/** What emoji-mart hands to onEmojiSelect (loosely typed upstream). */
interface PickedEmoji {
  id: string;
  native?: string;
}

/**
 * The emoji panel: emoji-mart's Picker (the same library and layout Elk /
 * elk.zone uses — credit where due), wrapped as an Angular component. The
 * library and its data are bundled locally; nothing is fetched from a CDN,
 * and emoji render as native glyphs. Instance custom emojis are merged in
 * as their own category and emit as `:shortcode:` text.
 */
@Component({
  selector: 'app-emoji-picker',
  template: `<div #host class="emoji-picker-host"></div>`,
  styles: `
    .emoji-picker-host {
      display: block;
      /* Reserve the picker's footprint so the popover doesn't jump on load. */
      min-width: 352px;
      min-height: 435px;
    }
  `,
})
export class EmojiPicker implements OnDestroy {
  private prefs = inject(ClientPrefs);
  private customEmojis = inject(CustomEmojis);

  /** Emits the text to insert: a native emoji or a `:shortcode:`. */
  readonly picked = output<string>();

  private host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private picker: HTMLElement | null = null;
  private destroyed = false;

  constructor() {
    this.customEmojis.ensureLoaded();
    // (Re)build the picker when the host appears or custom emojis arrive.
    effect(() => {
      const emojis = this.customEmojis.emojis();
      const el = this.host().nativeElement;
      void this.build(el, emojis);
    });
  }

  private async build(
    el: HTMLDivElement,
    emojis: { shortcode: string; url: string; static_url: string }[],
  ): Promise<void> {
    const [mart, dataModule] = await Promise.all([
      import('emoji-mart'),
      import('@emoji-mart/data'),
    ]);
    if (this.destroyed) {
      return;
    }
    const custom = emojis.length
      ? [
          {
            id: 'custom',
            name: 'Custom',
            emojis: emojis.map((e) => ({
              id: e.shortcode,
              name: e.shortcode,
              keywords: [e.shortcode],
              skins: [{ src: e.url || e.static_url }],
            })),
          },
        ]
      : undefined;

    this.picker?.remove();
    // Picker is a web component; emoji-mart's constructor typing is loose.
    this.picker = new mart.Picker({
      data: (dataModule as { default: unknown }).default,
      custom,
      set: 'native',
      theme: this.prefs.themeMode() === 'auto' ? 'auto' : this.prefs.themeMode(),
      autoFocus: true,
      previewPosition: 'bottom',
      onEmojiSelect: (emoji: PickedEmoji) => {
        this.picked.emit(emoji.native ?? `:${emoji.id}:`);
      },
    }) as unknown as HTMLElement;
    el.appendChild(this.picker);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.picker?.remove();
  }
}
