import { Component, effect, inject, input, signal, Type } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { normalizeHashtag } from '../hashtag';
import type { TagFilterDialog } from './tag-filter-dialog';
import { Auth } from '../auth';
import { Server } from '../server';

// i18n tagFilter.mute: Mute #{{tag}}…
@Component({
  selector: 'app-tag-mute-menu',
  imports: [NgComponentOutlet, TranslocoPipe, MbButton],
  template: `@for (tag of tags(); track tag) {
      <button type="button" mbButton variant="outline" size="small" (click)="open(tag, $event)">
        {{ 'tagFilter.mute' | transloco: { tag } }}
      </button>
    }
    @if (active(); as tag) {
      @if (component(); as dialog) {
        <ng-container [ngComponentOutlet]="dialog" [ngComponentOutletInputs]="{ tag, finish }" />
      }
      @if (failed()) {
        <p role="alert">{{ 'tagFilter.failed' | transloco }}</p>
      }
    }`,
})
export class TagMuteMenu {
  private auth = inject(Auth);
  private server = inject(Server);
  constructor() {
    let identity: string | undefined;
    effect(() => {
      const next = `${this.auth.kind()}:${this.auth.token()}:${this.server.baseUrl()}`;
      if (identity !== undefined && identity !== next) this.active.set(null);
      identity = next;
    });
  }
  readonly tags = input.required<string[]>();
  protected active = signal<string | null>(null);
  protected component = signal<Type<TagFilterDialog> | null>(null);
  protected failed = signal(false);
  private menu: HTMLDetailsElement | null = null;
  protected finish = () => {
    this.active.set(null);
    if (this.menu) {
      this.menu.open = false;
      this.menu.querySelector('summary')?.focus();
      this.menu = null;
    }
  };
  protected open(tag: string, event: Event): void {
    event.stopPropagation();
    const details = (event.target as HTMLElement).closest('details');
    this.menu = details;
    if (details) {
      details.querySelector('summary')?.focus();
    }
    const valid = normalizeHashtag(tag);
    if (!valid) return;
    this.active.set(valid);
    this.failed.set(false);
    void import('./tag-filter-dialog')
      .then((module) => this.component.set(module.TagFilterDialog))
      .catch(() => this.failed.set(true));
  }
}
