import {
  Component,
  computed,
  inject,
  Injectable,
  input,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbNotice } from '../../design-system/notice/notice';
import { ServerAbout } from '../../discovery/server-about';
import { Server } from '../../platform/http/server';
import {
  FedicensusFile,
  fedicensusFor,
  joinNames,
  loadFedicensus,
  placeNames,
} from '../jurisdiction/fedicensus';
import {
  jurisdictionFor,
  jurisdictionHost,
  JurisdictionRecord,
} from '../jurisdiction/jurisdiction';

// i18n report.gate.title: Before you report
// i18n report.gate.who: Reports from your account go to the moderators of {{server}}. They apply {{server}}’s rules, not the rules of the author’s server.
// i18n report.gate.where: When last crawled ({{date}}), {{server}} said its jurisdiction was {{jurisdiction}}.
// i18n report.gate.whereNone: When last crawled ({{date}}), {{server}}’s Terms and About pages did not state a jurisdiction.
// i18n report.gate.whereUnknown: We have not recorded where {{server}} is based.
// i18n report.gate.census.places: {{server}}’s policies mention {{places}}.
// i18n report.gate.census.laws: They refer to these laws: {{laws}}.
// i18n report.gate.census.names: Organizations named: {{names}}.
// i18n report.gate.census.source: Found by a word search of the server’s pages on {{date}}, so a mention may not mean that law applies. Source:
// i18n report.gate.quote: What the server wrote
// i18n report.gate.warning: Read the Terms of Service or About page for the full legal notices, if any.
// i18n report.gate.rulesCount.one: {{server}} has published {{count}} rule.
// i18n report.gate.rulesCount.other: {{server}} has published {{count}} rules.
// i18n report.gate.rulesNone: {{server}} has not published any rules.
// i18n report.gate.links: Read for yourself
// i18n report.gate.rules: Rules
// i18n report.gate.terms: Terms of Service
// i18n report.gate.about: About {{server}}
// i18n report.gate.loading: Loading {{server}}’s rules and terms…
// i18n report.gate.ignore: Only want to stop seeing this? Muting or blocking works at once, and nobody is told.

const STORAGE_KEY = 'mockingbird_report_gate_v1';

/**
 * Which version of a server's legal text the reader has acknowledged.
 *
 * The crawl's content hash when the server was crawled (it changes when the
 * Terms or About page does); otherwise the Terms' effective date; otherwise a
 * constant, so a server with neither is acknowledged once.
 */
export function gateFingerprint(
  record: JurisdictionRecord | undefined,
  termsEffectiveDate: string | null | undefined,
): string {
  return record?.hash ?? (termsEffectiveDate ? `terms:${termsEffectiveDate}` : 'none');
}

/** The reader's acknowledgements, one fingerprint per server host. */
@Injectable({ providedIn: 'root' })
export class ReportGateAcknowledgements {
  private read(): Record<string, string> {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
    } catch {
      return {};
    }
  }

  acknowledged(host: string, fingerprint: string): boolean {
    return this.read()[host] === fingerprint;
  }

  /** Whether this server was ever acknowledged, whatever its text said then. */
  seen(host: string): boolean {
    return host in this.read();
  }

  acknowledge(host: string, fingerprint: string): void {
    const all = this.read();
    all[host] = fingerprint;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Storage full or blocked: the gate simply shows again next time.
    }
  }
}

/**
 * Who reads a report and under which rules and law, before the reader writes
 * one (spec/moderation-facets.md §5). Mastodon only: a report always goes to
 * the reader's own server, whatever server the author is on.
 */
@Injectable({ providedIn: 'root' })
export class ReportGateModel {
  private readonly server = inject(Server);
  private readonly about = inject(ServerAbout);
  private readonly acks = inject(ReportGateAcknowledgements);

  /** The reader's server: its origin, and the host the gate names. */
  readonly origin = computed(() => this.server.baseUrl() || location.origin);
  readonly host = computed(() => jurisdictionHost(this.origin()));
  readonly record = computed(() => jurisdictionFor(this.host()));
  readonly fingerprint = computed(() =>
    gateFingerprint(this.record(), this.about.terms()?.effective_date),
  );
  /** Rules and terms are still being fetched (they decide the fingerprint). */
  readonly loading = computed(
    () =>
      this.about.loading() || this.about.rules() === undefined || this.about.terms() === undefined,
  );

  private readonly censusFile = signal<FedicensusFile | null>(null);
  /** Fedicensus's evidence, where our own extraction has no answer. */
  readonly census = computed(() => {
    const file = this.censusFile();
    if (!file || this.record()?.jurisdiction) return undefined;
    const record = fedicensusFor(file, this.host());
    return record && { ...record, date: file.date };
  });

  load(): void {
    this.about.load();
    if (this.censusFile() || this.record()?.jurisdiction) return;
    loadFedicensus().then(
      (file) => this.censusFile.set(file),
      () => {
        // Offline before it was ever loaded: the gate says what it can without it.
      },
    );
  }

  /**
   * Show the gate unless this server's current text was acknowledged. While
   * the text is loading, a server acknowledged before does not flash the gate.
   */
  needed(): boolean {
    const host = this.host();
    if (this.loading()) return !this.acks.seen(host);
    return !this.acks.acknowledged(host, this.fingerprint());
  }

  acknowledge(): void {
    this.acks.acknowledge(this.host(), this.fingerprint());
  }
}

@Component({
  selector: 'app-report-gate',
  imports: [TranslocoPipe, MbNotice],
  template: `
    @let server = model.host();
    <p>{{ 'report.gate.who' | transloco: { server } }}</p>
    @let record = model.record();
    @if (record?.jurisdiction) {
      <p>
        {{
          'report.gate.where'
            | transloco: { server, date: record!.crawledAt, jurisdiction: record!.jurisdiction }
        }}
      </p>
      @if (record!.quote) {
        <details class="gate-quote">
          <summary>{{ 'report.gate.quote' | transloco }}</summary>
          <blockquote>{{ record!.quote }}</blockquote>
        </details>
      }
    } @else if (model.census(); as census) {
      <div class="gate-census">
        @if (places(); as places) {
          <p>{{ 'report.gate.census.places' | transloco: { server, places } }}</p>
        }
        @if (laws(); as laws) {
          <p>{{ 'report.gate.census.laws' | transloco: { laws } }}</p>
        }
        @if (names(); as names) {
          <p>{{ 'report.gate.census.names' | transloco: { names } }}</p>
        }
        <p class="muted small">
          {{ 'report.gate.census.source' | transloco: { date: census.date } }}
          <a
            [href]="'https://fedicensus.org/servers/' + server + '/'"
            target="_blank"
            rel="noopener noreferrer"
            >Fedicensus</a
          >
          (<a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            >CC BY 4.0</a
          >)
        </p>
      </div>
    } @else if (record) {
      <p>{{ 'report.gate.whereNone' | transloco: { server, date: record.crawledAt } }}</p>
    } @else {
      <p>{{ 'report.gate.whereUnknown' | transloco: { server } }}</p>
    }
    <mb-notice>{{ 'report.gate.warning' | transloco }}</mb-notice>
    @if (model.loading()) {
      <p class="muted small">{{ 'report.gate.loading' | transloco: { server } }}</p>
    } @else if (about.hasRules()) {
      <p class="muted small">
        {{
          (rulesCount() === 1 ? 'report.gate.rulesCount.one' : 'report.gate.rulesCount.other')
            | transloco: { server, count: rulesCount() }
        }}
      </p>
    } @else {
      <p class="muted small">{{ 'report.gate.rulesNone' | transloco: { server } }}</p>
    }
    <nav class="gate-links" [attr.aria-label]="'report.gate.links' | transloco">
      @if (about.hasRules()) {
        <button type="button" class="link-button" (click)="rulesOpen.set(!rulesOpen())">
          {{ 'report.gate.rules' | transloco }}
        </button>
      }
      @if (about.hasTerms()) {
        <a [href]="model.origin() + '/terms-of-service'" target="_blank" rel="noopener">
          {{ 'report.gate.terms' | transloco }}
        </a>
      }
      <a [href]="model.origin() + '/about'" target="_blank" rel="noopener">
        {{ 'report.gate.about' | transloco: { server } }}
      </a>
    </nav>
    @if (rulesOpen()) {
      <ol class="gate-rules">
        @for (rule of about.rules() ?? []; track rule.id) {
          <li>{{ rule.text }}</li>
        }
      </ol>
    }
    @if (offerAlternatives()) {
      <p class="muted small">{{ 'report.gate.ignore' | transloco }}</p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: block;
    }
    .gate-links {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin: 8px 0;
    }
    .gate-quote blockquote {
      margin: 6px 0 0;
      font-style: italic;
    }
    .gate-rules {
      max-height: 30vh;
      overflow-y: auto;
    }
    .link-button {
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
export class ReportGate {
  protected readonly model = inject(ReportGateModel);
  protected readonly about = inject(ServerAbout);
  private readonly transloco = inject(TranslocoService);
  private join(names: readonly string[] | undefined): string {
    return names?.length ? joinNames(names, this.transloco.getActiveLang()) : '';
  }
  protected readonly places = computed(() =>
    this.join(placeNames(this.model.census()?.places ?? [], this.transloco.getActiveLang())),
  );
  protected readonly laws = computed(() => this.join(this.model.census()?.laws));
  protected readonly names = computed(() => this.join(this.model.census()?.names));
  /** Mention that mute and block exist (they are offered on the next step). */
  readonly offerAlternatives = input(true);
  protected readonly rulesOpen = signal(false);
  protected readonly rulesCount = computed(() => this.about.rules()?.length ?? 0);
}
