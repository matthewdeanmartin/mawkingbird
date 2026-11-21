import { signal } from '@angular/core';

export interface StoredReaderTypography {
  readerFontWeight?: number;
  readerLineHeight?: number;
}

export class ReaderTypography {
  readonly fontWeight = signal(400);
  readonly lineHeight = signal(1.65);

  setFontWeight(weight: number): void {
    this.fontWeight.set(Math.min(700, Math.max(300, Math.round(weight / 100) * 100)));
  }

  setLineHeight(value: number): void {
    this.lineHeight.set(Math.min(2.4, Math.max(1.2, value)));
  }

  load(stored: StoredReaderTypography): void {
    if (typeof stored.readerFontWeight === 'number') this.setFontWeight(stored.readerFontWeight);
    if (typeof stored.readerLineHeight === 'number') this.setLineHeight(stored.readerLineHeight);
  }

  snapshot(): StoredReaderTypography {
    return { readerFontWeight: this.fontWeight(), readerLineHeight: this.lineHeight() };
  }

  apply(style: CSSStyleDeclaration): void {
    style.setProperty('--reader-font-weight', String(this.fontWeight()));
    style.setProperty('--reader-line-height', String(this.lineHeight()));
  }
}
