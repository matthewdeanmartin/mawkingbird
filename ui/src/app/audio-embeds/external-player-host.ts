import { NgComponentOutlet } from '@angular/common';
import { Component, computed, DestroyRef, inject, input, signal, Type } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { ExternalMedia } from './providers';

/** Timeline cards keep widget SDKs and Radio out of eager application imports. */
@Component({
  selector: 'app-external-player',
  imports: [NgComponentOutlet, TranslocoPipe, MbButton],
  template: `
    @if (component(); as player) {
      <ng-container [ngComponentOutlet]="player" [ngComponentOutletInputs]="inputs()" />
    } @else {
      @if (source().embed) {
        <button mbButton variant="outline" type="button" [disabled]="loading()" (click)="load()">
          {{ 'external.load' | transloco: { provider: source().label } }}
        </button>
      } @else {
        <p>{{ 'external.unresolved' | transloco }}</p>
      }
      <a [href]="source().url" target="_blank" rel="noopener noreferrer">{{
        'external.open' | transloco: { provider: source().label }
      }}</a>
    }
    @if (failed()) {
      <p role="alert">{{ 'external.failed' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-block: 12px;
    }
    a {
      margin-inline: 8px;
    }
  `,
  host: { '(click)': '$event.stopPropagation()' },
})
export class ExternalPlayerHost {
  readonly source = input.required<ExternalMedia>();
  readonly component = signal<Type<unknown> | null>(null);
  readonly failed = signal(false);
  readonly loading = signal(false);
  readonly inputs = computed(() => ({ source: this.source(), activate: true }));
  private readonly destroy = inject(DestroyRef);
  load(): void {
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
