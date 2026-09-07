import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MockApi } from '../../mock-api';
import { FaultEffectType, FaultRule, FaultRuleDraft } from '../../models';

// i18n pages.faultInjection.title: Fault injection
// i18n pages.faultInjection.intro: Inject rate-limits, latency, timeouts, or malformed JSON into matching requests.
// i18n pages.faultInjection.introExempt: paths are never affected.
// i18n pages.faultInjection.addRuleHeading: Add a rule
// i18n pages.faultInjection.methodLabel: Method
// i18n pages.faultInjection.methodPlaceholder: POST (any if blank)
// i18n pages.faultInjection.pathLabel: Path (exact or glob with *)
// i18n pages.faultInjection.pathRegexLabel: Path regex (alternative to glob)
// i18n pages.faultInjection.effectLabel: Effect
// i18n pages.faultInjection.effectStatus: status
// i18n pages.faultInjection.effectRatelimit: ratelimit
// i18n pages.faultInjection.effectLatency: latency
// i18n pages.faultInjection.effectTimeout: timeout
// i18n pages.faultInjection.effectMalformed: malformed
// i18n pages.faultInjection.httpStatusLabel: HTTP status
// i18n pages.faultInjection.delayLabel: Delay (ms)
// i18n pages.faultInjection.fireCountLabel: Fire count (blank = forever)
// i18n pages.faultInjection.adding: Adding…
// i18n pages.faultInjection.addRule: Add rule
// i18n pages.faultInjection.activeRulesHeading: Active rules
// i18n pages.faultInjection.clearAll: clear all
// i18n pages.faultInjection.loading: Loading…
// i18n pages.faultInjection.noRules: No fault rules active.
// i18n pages.faultInjection.colId: id
// i18n pages.faultInjection.colMatch: match
// i18n pages.faultInjection.colEffect: effect
// i18n pages.faultInjection.colRemaining: remaining
// i18n pages.faultInjection.anyMethod: any
// i18n pages.faultInjection.msValue: {{ms}}ms
// i18n pages.faultInjection.remove: remove
// i18n pages.faultInjection.addRuleFailed: Could not add rule.
@Component({
  selector: 'app-fault-injection',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './fault-injection.html',
  styleUrl: './fault-injection.css',
})
export class FaultInjection implements OnInit {
  private api = inject(MockApi);
  private transloco = inject(TranslocoService);

  protected rules = signal<FaultRule[]>([]);
  protected loading = signal(true);
  protected error = signal<string | null>(null);

  // New-rule form state.
  protected method = signal('');
  protected path = signal('');
  protected pathRegex = signal('');
  protected effectType = signal<FaultEffectType>('status');
  protected status = signal(503);
  protected delayMs = signal(0);
  protected count = signal<number | null>(null);
  protected adding = signal(false);

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.api.listFaults().subscribe({
      next: (rules) => {
        this.rules.set(rules);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  addRule(): void {
    this.error.set(null);
    const draft: FaultRuleDraft = {
      match: {
        ...(this.method().trim() ? { methods: [this.method().trim().toUpperCase()] } : {}),
        ...(this.path().trim() ? { path: this.path().trim() } : {}),
        ...(this.pathRegex().trim() ? { path_regex: this.pathRegex().trim() } : {}),
      },
      effect: {
        type: this.effectType(),
        status: this.status(),
        delay_ms: this.delayMs(),
      },
      ...(this.count() ? { count: this.count()! } : {}),
    };
    this.adding.set(true);
    this.api.addFault(draft).subscribe({
      next: (rule) => {
        this.adding.set(false);
        this.rules.update((list) => [...list, rule]);
      },
      error: (err) => {
        this.adding.set(false);
        this.error.set(
          err?.error?.detail ??
            this.transloco.translate<string>('pages.faultInjection.addRuleFailed'),
        );
      },
    });
  }

  remove(id: string): void {
    this.api.deleteFault(id).subscribe(() => {
      this.rules.update((list) => list.filter((r) => r.id !== id));
    });
  }

  clearAll(): void {
    this.api.clearFaults().subscribe(() => this.rules.set([]));
  }

  needsStatus(): boolean {
    return this.effectType() === 'status' || this.effectType() === 'ratelimit';
  }

  needsDelay(): boolean {
    return this.effectType() === 'latency' || this.effectType() === 'timeout';
  }
}
