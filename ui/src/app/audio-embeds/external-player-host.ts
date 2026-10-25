import { NgComponentOutlet } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
  Type,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbToolbar, MbToolbarButton } from '../design-system/toolbar/toolbar';
import type { ExternalPlayer } from './external-player';
import { ExternalMedia } from './providers';

/** Timeline cards keep widget SDKs and Radio out of eager application imports. */
@Component({
  selector: 'app-external-player',
  imports: [NgComponentOutlet, TranslocoPipe, MbToolbar, MbToolbarButton],
  template: `
    @if (component(); as player) {
      <ng-container [ngComponentOutlet]="player" [ngComponentOutletInputs]="inputs()" />
    }
    @if (!toolbar()) {
      <mb-toolbar density="compact" embedded [label]="source().label">
        @if (source().embed) {
          <button mbToolbarButton [disabled]="loading()" (click)="active() ? close() : load()">
            {{
              active()
                ? ('external.close' | transloco)
                : ('external.load' | transloco: { provider: source().label })
            }}
          </button>
        }
        <button mbToolbarButton (click)="openOriginal()">
          {{ 'external.open' | transloco: { provider: source().label } }}
        </button>
      </mb-toolbar>
    }
    @if (failed()) {
      <p role="alert">{{ 'external.failed' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-block: 0;
    }
    :host(.active) {
      margin-block: 12px;
    }
  `,
  host: { '(click)': '$event.stopPropagation()', '[class.active]': 'active()' },
})
export class ExternalPlayerHost {
  readonly toolbar = input(false);
  private readonly outlet = viewChild(NgComponentOutlet);
  active(): boolean {
    return !!(this.outlet()?.componentInstance as ExternalPlayer | null)?.activated();
  }
  close(): void {
    this.component.set(null);
  }
  openOriginal(): void {
    window.open(this.source().url, '_blank', 'noopener,noreferrer');
  }
  readonly source = input.required<ExternalMedia>();
  readonly component = signal<Type<unknown> | null>(null);
  readonly failed = signal(false);
  readonly loading = signal(false);
  readonly inputs = computed(() => ({ source: this.source(), activate: true, hideActions: true }));
  private readonly destroy = inject(DestroyRef);
  load(): void {
    const existing = this.outlet()?.componentInstance as ExternalPlayer | null;
    if (existing) {
      existing.activated.set(true);
      return;
    }
    this.failed.set(false);
    this.loading.set(true);
    void import('./external-player')
      .then((module) => {
        if (!this.destroy.destroyed) this.component.set(module.ExternalPlayer);
      })
      .catch(() => {
        if (!this.destroy.destroyed) this.failed.set(true);
      })
      .finally(() => {
        if (!this.destroy.destroyed) this.loading.set(false);
      });
  }
}
