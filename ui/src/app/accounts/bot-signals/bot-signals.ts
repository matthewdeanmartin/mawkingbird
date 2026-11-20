import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbBadge } from '../../design-system/badge/badge';
import { MbHelp } from '../../design-system/help/help';
import { Account, Status } from '../../platform/api/models';
import { intervalParts, postingRhythm } from '../account-signals';

// i18n botSignals.botTitle: This account says it is automated (its own bot setting).
// i18n botSignals.botLike: Bot-like
// i18n botSignals.mixed: Partly scheduled
// i18n botSignals.about: About this label
// i18n botSignals.help.botLike: {{pct}}% of the {{count}} posts loaded arrive on a fixed schedule (runs of 4 or more posts at the same interval, such as every {{interval}}). Posting like this usually comes from a bot or a scheduler.
// i18n botSignals.help.mixed: {{pct}}% of the {{count}} posts loaded arrive on a fixed schedule (runs of 4 or more posts at the same interval, such as every {{interval}}); the rest are irregular, like live posting.
// i18n botSignals.unit.minutes: {{value}} min
// i18n botSignals.unit.hours: {{value}} h
// i18n botSignals.unit.days: {{value}} d

/**
 * Bot labels beside a name: the account's own bot setting, and a "bot-like"
 * label when its posting runs on a clock (see `postingRhythm`). Accounts whose
 * posting looks human get no label here; analytics shows the full verdict.
 */
@Component({
  selector: 'app-bot-signals',
  imports: [MbBadge, MbHelp, TranslocoPipe],
  template: `
    @if (account().bot) {
      <mb-badge tone="attention" class="bot" [title]="'botSignals.botTitle' | transloco">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
          <path
            fill="currentColor"
            d="M11 2h2v2h4a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4V2Zm-2 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-6 5v1.5h6V15H9ZM1 9h2v5H1V9Zm20 0h2v5h-2V9Z"
          />
        </svg>
        {{ 'pages.profile.bot' | transloco }}
      </mb-badge>
    }
    @if (rhythm(); as r) {
      <mb-badge class="bot-like">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            d="M12 7v5l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"
          />
        </svg>
        {{ (r.verdict === 'botLike' ? 'botSignals.botLike' : 'botSignals.mixed') | transloco }}
      </mb-badge>
      <mb-help [label]="'botSignals.about' | transloco">{{
        (r.verdict === 'botLike' ? 'botSignals.help.botLike' : 'botSignals.help.mixed')
          | transloco
            : {
                pct: r.regularPct,
                count: r.considered,
                interval: ('botSignals.unit.' + r.unit | transloco: { value: r.value }),
              }
      }}</mb-help>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      vertical-align: middle;
    }
    mb-badge svg {
      vertical-align: -2px;
      margin-inline-end: 2px;
    }
  `,
})
export class BotSignals {
  readonly account = input.required<Account>();
  /** The account's loaded statuses; the rhythm needs at least 8 own posts. */
  readonly posts = input<readonly Status[]>([]);

  /** The rhythm, only when it is worth a label (not human, not too few posts). */
  protected rhythm = computed(() => {
    const own = this.posts().filter((p) => p.account.id === this.account().id);
    const rhythm = postingRhythm(own);
    if (!rhythm || rhythm.verdict === 'human' || rhythm.interval === null) return null;
    return { ...rhythm, ...intervalParts(rhythm.interval) };
  });
}
