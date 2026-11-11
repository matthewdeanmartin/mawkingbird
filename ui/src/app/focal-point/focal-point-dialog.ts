import { Component, computed, input, OnInit, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { MbDialog } from '../design-system/dialog/dialog';
import { CENTRE, FocalPoint, nudge, objectPosition, pointFromClick } from './focal-point';

// i18n focalPoint.title: Focus point
// i18n focalPoint.intro: Click the part of the picture that must stay visible when it is shown cropped, such as a face. Arrow keys move the point.
// i18n focalPoint.picker: Focus point: {{x}}% from the left, {{y}}% from the top
// i18n focalPoint.preview: How it looks cropped
// i18n focalPoint.reset: Back to the centre
// i18n focalPoint.apply: Use this point
// i18n focalPoint.cancel: Cancel

/**
 * Pick where a picture's crop should centre. Shows the whole image to click on
 * and two cropped previews (wide and square), the shapes timelines use.
 */
@Component({
  selector: 'app-focal-point-dialog',
  imports: [MbButton, MbDialog, TranslocoPipe],
  template: `
    <mb-dialog
      [title]="'focalPoint.title' | transloco"
      [closeLabel]="'focalPoint.cancel' | transloco"
      size="wide"
      (dismissed)="closed.emit()"
    >
      <p class="muted small">{{ 'focalPoint.intro' | transloco }}</p>
      <div class="focal-layout">
        <!-- A two-axis slider: the value spoken is both percentages; the
             numeric value tracks the horizontal one for assistive tech that
             needs a number. Click anywhere on the picture, or use arrows. -->
        <div
          class="focal-stage"
          role="slider"
          tabindex="0"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-valuenow]="percent().x"
          [attr.aria-label]="'focalPoint.title' | transloco"
          [attr.aria-valuetext]="'focalPoint.picker' | transloco: percent()"
          (keydown)="onKey($event)"
          (click)="onClick($event, picture)"
        >
          <img #picture [src]="src()" [alt]="alt()" />
          <span
            class="focal-marker"
            aria-hidden="true"
            [style.left.%]="percent().x"
            [style.top.%]="percent().y"
          ></span>
        </div>
        <div class="focal-previews">
          <p class="small muted">{{ 'focalPoint.preview' | transloco }}</p>
          <img class="focal-wide" [src]="src()" alt="" [style.object-position]="position()" />
          <img class="focal-square" [src]="src()" alt="" [style.object-position]="position()" />
        </div>
      </div>
      <ng-container mbDialogActions>
        <button mbButton variant="link" type="button" (click)="point.set(centre)">
          {{ 'focalPoint.reset' | transloco }}
        </button>
        <button mbButton variant="outline" type="button" (click)="closed.emit()">
          {{ 'focalPoint.cancel' | transloco }}
        </button>
        <button mbButton type="button" (click)="applied.emit(point())">
          {{ 'focalPoint.apply' | transloco }}
        </button>
      </ng-container>
    </mb-dialog>
  `,
  styles: `
    .focal-layout {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    .focal-stage {
      position: relative;
      line-height: 0;
      cursor: crosshair;
      outline-offset: 2px;
    }
    .focal-stage img {
      max-width: 100%;
      max-height: 60vh;
      border-radius: 6px;
    }
    .focal-marker {
      position: absolute;
      width: 28px;
      height: 28px;
      margin: -14px 0 0 -14px;
      border: 3px solid #fff;
      border-radius: 50%;
      box-shadow:
        0 0 0 2px #000,
        inset 0 0 0 2px #000;
      pointer-events: none;
    }
    .focal-previews {
      display: grid;
      gap: 8px;
    }
    .focal-previews p {
      margin: 0;
    }
    .focal-wide,
    .focal-square {
      width: 100%;
      object-fit: cover;
      border-radius: 6px;
      background: var(--bg);
    }
    .focal-wide {
      aspect-ratio: 16 / 9;
    }
    .focal-square {
      aspect-ratio: 1;
      max-width: 8rem;
    }
    @media (max-width: 560px) {
      .focal-layout {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class FocalPointDialog implements OnInit {
  readonly src = input.required<string>();
  readonly alt = input('');
  readonly initial = input<FocalPoint | null>(null);
  readonly applied = output<FocalPoint>();
  readonly closed = output<void>();

  protected readonly centre = CENTRE;
  protected readonly point = signal<FocalPoint>(CENTRE);
  protected readonly position = computed(() => objectPosition(this.point()) ?? '50% 50%');
  /** Marker position and spoken value, as percentages from the top-left. */
  protected readonly percent = computed(() => ({
    x: Math.round(((this.point().x + 1) / 2) * 100),
    y: Math.round(((1 - this.point().y) / 2) * 100),
  }));

  ngOnInit(): void {
    this.point.set(this.initial() ?? CENTRE);
  }

  protected onClick(event: MouseEvent, image: Element): void {
    this.point.set(pointFromClick(event, image));
  }

  protected onKey(event: KeyboardEvent): void {
    const next = nudge(this.point(), event.key);
    if (!next) return;
    event.preventDefault();
    this.point.set(next);
  }
}
