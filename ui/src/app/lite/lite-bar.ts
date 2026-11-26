import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LitePrefs, LitePrefsValue } from './lite-prefs';

// i18n lite.bar.label: What Lite loads
// i18n lite.bar.pictures: Pictures
// i18n lite.bar.pictures.off: Off
// i18n lite.bar.pictures.tap: Tap to load
// i18n lite.bar.pictures.on: On
// i18n lite.bar.avatars: Avatars
// i18n lite.bar.previews: Video and audio
// i18n lite.bar.updates: Updates
// i18n lite.bar.updates.manual: Refresh only
// i18n lite.bar.updates.stale: When out of date
// i18n lite.bar.reading: Reading
// i18n lite.bar.textSize: Text size
// i18n lite.bar.textSize.s: Small
// i18n lite.bar.textSize.m: Normal
// i18n lite.bar.textSize.l: Large
// i18n lite.bar.textSize.xl: Larger
// i18n lite.bar.width: Line width
// i18n lite.bar.width.narrow: Narrow
// i18n lite.bar.width.normal: Normal
// i18n lite.bar.width.wide: Wide
// i18n lite.bar.contrast: High contrast

/**
 * Lite's load-control bar: what posts may spend on media, whether screens
 * check for updates by themselves, and a few reading controls. Every choice is
 * local and takes effect at once; none of them makes a request.
 */
@Component({
  selector: 'app-lite-bar',
  imports: [TranslocoPipe],
  template: `
    @let v = prefs.value();
    <div class="lite-bar-controls" role="group" [attr.aria-label]="'lite.bar.label' | transloco">
      <label>
        {{ 'lite.bar.pictures' | transloco }}
        <select [value]="v.pictures" (change)="choose('pictures', $event)">
          <option value="off">{{ 'lite.bar.pictures.off' | transloco }}</option>
          <option value="tap">{{ 'lite.bar.pictures.tap' | transloco }}</option>
          <option value="on">{{ 'lite.bar.pictures.on' | transloco }}</option>
        </select>
      </label>
      <label>
        <input type="checkbox" [checked]="v.avatars" (change)="toggle('avatars', $event)" />
        {{ 'lite.bar.avatars' | transloco }}
      </label>
      <label>
        <input type="checkbox" [checked]="v.previews" (change)="toggle('previews', $event)" />
        {{ 'lite.bar.previews' | transloco }}
      </label>
      <label>
        {{ 'lite.bar.updates' | transloco }}
        <select [value]="v.refresh" (change)="choose('refresh', $event)">
          <option value="manual">{{ 'lite.bar.updates.manual' | transloco }}</option>
          <option value="stale">{{ 'lite.bar.updates.stale' | transloco }}</option>
        </select>
      </label>
      <details class="reading">
        <summary>{{ 'lite.bar.reading' | transloco }}</summary>
        <div class="reading-controls">
          <label>
            {{ 'lite.bar.textSize' | transloco }}
            <select [value]="v.textSize" (change)="choose('textSize', $event)">
              <option value="s">{{ 'lite.bar.textSize.s' | transloco }}</option>
              <option value="m">{{ 'lite.bar.textSize.m' | transloco }}</option>
              <option value="l">{{ 'lite.bar.textSize.l' | transloco }}</option>
              <option value="xl">{{ 'lite.bar.textSize.xl' | transloco }}</option>
            </select>
          </label>
          <label>
            {{ 'lite.bar.width' | transloco }}
            <select [value]="v.width" (change)="choose('width', $event)">
              <option value="narrow">{{ 'lite.bar.width.narrow' | transloco }}</option>
              <option value="normal">{{ 'lite.bar.width.normal' | transloco }}</option>
              <option value="wide">{{ 'lite.bar.width.wide' | transloco }}</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              [checked]="v.highContrast"
              (change)="toggle('highContrast', $event)"
            />
            {{ 'lite.bar.contrast' | transloco }}
          </label>
        </div>
      </details>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .lite-bar-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 14px;
      padding: 6px 16px;
      border-block-end: 1px solid var(--border);
      font-size: 13px;
      color: var(--muted);
    }
    label {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    select {
      font: inherit;
      color: var(--text);
      background: var(--col-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 2px 4px;
    }
    summary {
      cursor: pointer;
    }
    .reading-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      padding-block-start: 6px;
    }
  `,
})
export class LiteBar {
  protected readonly prefs = inject(LitePrefs);

  protected choose<K extends keyof LitePrefsValue>(key: K, event: Event): void {
    this.prefs.set(key, (event.target as HTMLSelectElement).value as LitePrefsValue[K]);
  }

  protected toggle<K extends keyof LitePrefsValue>(key: K, event: Event): void {
    this.prefs.set(key, (event.target as HTMLInputElement).checked as LitePrefsValue[K]);
  }
}
