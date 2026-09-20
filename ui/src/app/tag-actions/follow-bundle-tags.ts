import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Api } from '../api';
import { Auth } from '../auth';
import { AnonymousTags } from '../providers/anonymous/anonymous-tags';

// i18n followBundle.open: Follow all tags…
// i18n followBundle.checking: Checking followed tags…
// i18n followBundle.preview.one: Follow 1 remaining tag:
// i18n followBundle.preview.other: Follow {{count}} remaining tags:
// i18n followBundle.confirm: Follow these tags
// i18n followBundle.done: All tags in this bundle are followed.
// i18n followBundle.progress: Followed {{done}} of {{total}} tags.
// i18n followBundle.failed: Some tags couldn't be followed. Retry the remaining tags.
// i18n followBundle.checkFailed: Couldn't check followed tags. Please try again.
// i18n followBundle.retry: Retry remaining tags
// i18n followBundle.retryCheck: Check again
// i18n followBundle.rateLimit: The server asked us to slow down. Try again after {{time}}.
// i18n followBundle.cancel: Close
@Component({
  selector: 'app-follow-bundle-tags',
  imports: [TranslocoPipe],
  template: `
    @if (tags().length && (auth.isAnonymous || !auth.lacksMastodonToken)) {
      <button
        type="button"
        class="btn btn-sm btn-outline"
        [disabled]="busy()"
        (click)="prepare()"
        [attr.aria-expanded]="opened()"
      >
        {{ 'followBundle.open' | transloco }}
      </button>
      @if (opened()) {
        <div class="preview">
          @if (checking()) {
            <p role="status">{{ 'followBundle.checking' | transloco }}</p>
          } @else if (checkFailed()) {
            <p role="alert">{{ 'followBundle.checkFailed' | transloco }}</p>
            <button class="btn btn-sm" (click)="prepare()">
              {{ 'followBundle.retryCheck' | transloco }}
            </button>
          } @else {
            @if (remaining().length) {
              <p>
                {{
                  (remaining().length === 1
                    ? 'followBundle.preview.one'
                    : 'followBundle.preview.other'
                  ) | transloco: { count: remaining().length }
                }}
              </p>
              <p class="tags">{{ remaining().map(withHash).join(', ') }}</p>
              <button type="button" class="btn btn-sm" [disabled]="busy()" (click)="follow()">
                {{ (failed() ? 'followBundle.retry' : 'followBundle.confirm') | transloco }}
              </button>
            } @else {
              <p role="status">{{ 'followBundle.done' | transloco }}</p>
            }
            @if (total()) {
              <p role="status">
                {{
                  'followBundle.progress'
                    | transloco: { done: total() - remaining().length, total: total() }
                }}
              </p>
            }
            @if (failed()) {
              <p role="alert">{{ 'followBundle.failed' | transloco }}</p>
            }
            @if (failureReason()) {
              <p role="alert">{{ failureReason() }}</p>
            }
          }
          @if (retryAt()) {
            <p role="alert">{{ 'followBundle.rateLimit' | transloco: { time: retryTime() } }}</p>
          }
          <button
            type="button"
            class="btn btn-sm btn-outline"
            [disabled]="busy()"
            (click)="opened.set(false)"
          >
            {{ 'followBundle.cancel' | transloco }}
          </button>
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .preview {
      padding: 12px;
      margin-top: 8px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--col-bg);
    }
    .tags {
      overflow-wrap: anywhere;
    }
    button {
      margin: 3px;
    }
  `,
})
export class FollowBundleTags {
  readonly tags = input.required<string[]>();
  protected auth = inject(Auth);
  private api = inject(Api);
  private anonymousTags = inject(AnonymousTags);
  private destroyed = false;
  protected opened = signal(false);
  protected checking = signal(false);
  protected busy = signal(false);
  protected checkFailed = signal(false);
  protected failed = signal(false);
  protected failureReason = signal<string | null>(null);
  protected remaining = signal<string[]>([]);
  protected total = signal(0);
  protected retryAt = signal(0);
  protected withHash = (tag: string): string => '#' + tag;
  protected retryTime(): string {
    return new Date(this.retryAt()).toLocaleTimeString();
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
    });
  }

  protected async prepare(): Promise<void> {
    if (this.busy() || Date.now() < this.retryAt()) return;
    this.opened.set(true);
    this.busy.set(true);
    this.checking.set(true);
    this.checkFailed.set(false);
    this.failed.set(false);
    this.failureReason.set(null);
    this.total.set(0);
    this.retryAt.set(0);
    const token = this.auth.token();
    const tags = [...new Set(this.tags().map((tag) => tag.toLowerCase()))];
    const remaining: string[] = [];
    try {
      for (const tag of tags) {
        if (this.destroyed || token !== this.auth.token()) return;
        const following = this.auth.isAnonymous
          ? this.anonymousTags.has(tag)
          : (await firstValueFrom(this.api.getTag(tag))).following;
        if (!following) remaining.push(tag);
      }
      this.remaining.set(remaining);
    } catch (error) {
      this.checkFailed.set(true);
      this.recordRateLimit(error);
    } finally {
      this.checking.set(false);
      this.busy.set(false);
    }
  }

  protected async follow(): Promise<void> {
    if (this.busy() || Date.now() < this.retryAt()) return;
    this.busy.set(true);
    this.failed.set(false);
    this.failureReason.set(null);
    this.retryAt.set(0);
    if (!this.total()) this.total.set(this.remaining().length);
    const token = this.auth.token();
    try {
      for (const tag of this.remaining()) {
        if (this.destroyed || token !== this.auth.token()) return;
        try {
          if (this.auth.isAnonymous) {
            const result = this.anonymousTags.follow(tag);
            if (!result.ok) {
              this.failureReason.set(result.error);
              throw new Error(result.error);
            }
          } else await firstValueFrom(this.api.followTag(tag));
          this.remaining.update((current) => current.filter((name) => name !== tag));
        } catch (error) {
          this.failed.set(true);
          if (this.recordRateLimit(error)) break;
        }
      }
    } finally {
      this.busy.set(false);
    }
  }

  private recordRateLimit(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse) || error.status !== 429) return false;
    const retry = error.headers.get('Retry-After');
    const seconds = retry ? Number(retry) : NaN;
    const until = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retry ?? '');
    this.retryAt.set(
      Math.max(Date.now() + 1000, Number.isFinite(until) ? until : Date.now() + 60000),
    );
    return true;
  }
}
