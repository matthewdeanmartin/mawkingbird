import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbHelp } from '../../design-system/help/help';
import { AdultFilter } from '../../platform/storage/client-prefs';
import { AdultReason, AdultVerdict } from './adult-classifier';

// i18n adult.reason.declared: Their profile says “{{evidence}}”
// i18n adult.reason.bskySelfLabel: Labelled “{{evidence}}” by its author on Bluesky
// i18n adult.reason.bskyLabeler: Labelled “{{evidence}}” by a Bluesky moderation service
// i18n adult.reason.cw: Content warning “{{evidence}}”
// i18n adult.reason.hashtag: Tagged {{evidence}}
// i18n adult.reason.text: The post says “{{evidence}}”
// i18n adult.reason.server: Their server, {{evidence}}, is for adult content
// i18n adult.reason.posts: {{count}} of {{of}} of their loaded posts are adult
// i18n adult.reason.sensitive: Marked sensitive, with no warning saying why
// i18n adult.collapsed.post: Adult content
// i18n adult.collapsed.account: Adult account
// i18n adult.collapsed.show: Show
// i18n adult.why.label: Why this was classified as adult
// i18n adult.why.decided: Why:
// i18n adult.why.weak: Also seen, not enough on its own:
// i18n adult.why.how: Mawkingbird guesses this from the profile, content warnings, hashtags and labels of what is loaded. Mastodon’s “sensitive” flag alone never counts: people use it for food, politics and spoilers too. Guesses can be wrong.
// i18n adult.filter.label: Adult content
// i18n adult.filter.either: Show all
// i18n adult.filter.hide: Hide adult
// i18n adult.filter.only: Only adult
// i18n adult.filter.hidden.one: {{count}} hidden as adult
// i18n adult.filter.hidden.other: {{count}} hidden as adult
// i18n adult.filter.dropped.one: {{count}} not adult, left out
// i18n adult.filter.dropped.other: {{count}} not adult, left out
// i18n adult.filter.help: Sexual content only (porn, nudity, sex work). Your choice is remembered. Based on what is loaded, so it can be wrong; each hidden item says why.
// i18n adult.bskyHidden: Your Bluesky account hides adult content, so Bluesky leaves most of it out of search results. You can change that in Settings → Moderation on Bluesky.

const REASON_KEYS: Record<AdultReason['kind'], string> = {
  declared: 'adult.reason.declared',
  'bsky-self-label': 'adult.reason.bskySelfLabel',
  'bsky-labeler': 'adult.reason.bskyLabeler',
  cw: 'adult.reason.cw',
  hashtag: 'adult.reason.hashtag',
  text: 'adult.reason.text',
  server: 'adult.reason.server',
  posts: 'adult.reason.posts',
  sensitive: 'adult.reason.sensitive',
};

export function adultReasonKey(reason: AdultReason): string {
  return REASON_KEYS[reason.kind];
}

@Component({
  selector: 'app-adult-reasons',
  imports: [TranslocoPipe],
  template: `
    @if (verdict().reasons.length) {
      <p class="why-head">{{ 'adult.why.decided' | transloco }}</p>
      <ul>
        @for (r of verdict().reasons; track $index) {
          <li>{{ key(r) | transloco: r }}</li>
        }
      </ul>
    }
    @if (verdict().weak.length) {
      <p class="why-head">{{ 'adult.why.weak' | transloco }}</p>
      <ul>
        @for (r of verdict().weak; track $index) {
          <li>{{ key(r) | transloco: r }}</li>
        }
      </ul>
    }
    <p class="muted small">{{ 'adult.why.how' | transloco }}</p>
  `,
  styles: `
    .why-head {
      font-weight: 600;
      margin: 0 0 4px;
    }
    ul {
      margin: 0 0 8px;
      padding-inline-start: 18px;
    }
  `,
})
export class AdultReasons {
  readonly verdict = input.required<AdultVerdict>();
  protected key = adultReasonKey;
}

/**
 * What a hidden adult result collapses to: "⟨reason⟩ (i)", plus Show.
 * The (i) lists every piece of evidence, so nobody has to trust a score.
 */
@Component({
  selector: 'app-adult-collapsed',
  imports: [TranslocoPipe, MbHelp, AdultReasons],
  template: `
    <div class="adult-collapsed" data-adult-collapsed>
      <span class="label">{{
        (kind() === 'account' ? 'adult.collapsed.account' : 'adult.collapsed.post') | transloco
      }}</span>
      @if (first(); as r) {
        <span class="muted small reason">{{ key(r) | transloco: r }}</span>
      }
      <mb-help [label]="'adult.why.label' | transloco">
        <app-adult-reasons [verdict]="verdict()" />
      </mb-help>
      <button type="button" class="link-btn show" (click)="reveal.emit()">
        {{ 'adult.collapsed.show' | transloco }}
      </button>
    </div>
  `,
  styles: `
    .adult-collapsed {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 10px;
      padding: 8px 12px;
      border: 1px dashed var(--border);
      border-radius: 8px;
      margin: 6px 0;
    }
    .label {
      font-weight: 600;
    }
    .reason {
      flex: 1 1 12em;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .link-btn {
      background: none;
      border: 0;
      padding: 0;
      color: var(--ds-action-text);
      text-decoration: underline;
      cursor: pointer;
      font: inherit;
    }
  `,
})
export class AdultCollapsed {
  readonly verdict = input.required<AdultVerdict>();
  readonly kind = input<'post' | 'account'>('post');
  readonly reveal = output<void>();
  protected readonly first = computed(() => this.verdict().reasons[0] ?? null);
  protected key = adultReasonKey;
}

/** Show all / Hide adult / Only adult, with what the choice did to the loaded results. */
@Component({
  selector: 'app-adult-filter-control',
  imports: [TranslocoPipe, MbHelp],
  template: `
    <label class="adult-filter">
      <span class="muted small">{{ 'adult.filter.label' | transloco }}</span>
      <select [value]="value()" (change)="onChange($event)">
        <option value="either" [selected]="value() === 'either'">
          {{ 'adult.filter.either' | transloco }}
        </option>
        <option value="hide" [selected]="value() === 'hide'">
          {{ 'adult.filter.hide' | transloco }}
        </option>
        <option value="only" [selected]="value() === 'only'">
          {{ 'adult.filter.only' | transloco }}
        </option>
      </select>
    </label>
    <mb-help [label]="'adult.filter.label' | transloco">
      <p>{{ 'adult.filter.help' | transloco }}</p>
    </mb-help>
    @if (value() === 'hide' && hidden()) {
      <span class="muted small" data-adult-count>{{
        (hidden() === 1 ? 'adult.filter.hidden.one' : 'adult.filter.hidden.other')
          | transloco: { count: hidden() }
      }}</span>
    } @else if (value() === 'only' && dropped()) {
      <span class="muted small" data-adult-count>{{
        (dropped() === 1 ? 'adult.filter.dropped.one' : 'adult.filter.dropped.other')
          | transloco: { count: dropped() }
      }}</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 10px;
      margin: 6px 0;
    }
    .adult-filter {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
  `,
})
export class AdultFilterControl {
  readonly value = input.required<AdultFilter>();
  /** Loaded adult results currently collapsed (Hide). */
  readonly hidden = input(0);
  /** Loaded non-adult results left out (Only). */
  readonly dropped = input(0);
  readonly valueChange = output<AdultFilter>();

  protected onChange(event: Event): void {
    this.valueChange.emit((event.target as HTMLSelectElement).value as AdultFilter);
  }
}
