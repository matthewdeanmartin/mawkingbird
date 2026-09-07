import { inject, Injectable } from '@angular/core';
import { environment } from '../environments/environment';
import { BUILD_INFO } from './build-info';
import { ErrorLog } from './error-log';
import { ProviderRegistry } from './providers/provider-registry';
import { Server } from './server';
import { DiagnosticLog, formatDiagnosticEntry } from './diagnostic-log';

/** GitHub repo the "File on GitHub" link targets. */
const REPO = 'matthewdeanmartin/mawkingbird';
/**
 * GitHub rejects issue-prefill URLs that get too long (~8 KB of URL). Keep the
 * body well under that; if it's over, we truncate the technical section and the
 * user still has the full text on their clipboard.
 */
const MAX_BODY_LEN = 6_000;

/** Everything a report can carry. `description` is the user's; the rest is auto. */
export interface BugReportInput {
  description: string;
  includeErrors: boolean;
  includeDiagnostics?: boolean;
}

@Injectable({ providedIn: 'root' })
export class BugReport {
  private readonly server = inject(Server);
  private readonly providers = inject(ProviderRegistry);
  private readonly errorLog = inject(ErrorLog);
  private readonly diagnosticLog = inject(DiagnosticLog);

  /** Build the Markdown body a user files or pastes. */
  buildMarkdown(input: BugReportInput): string {
    const description = input.description.trim() || '_(no description provided)_';

    const sections = [
      `### What happened\n\n${description}`,
      `### Environment\n\n${this.environmentTable()}`,
    ];

    if (input.includeErrors) {
      const errors = this.formatErrors();
      if (errors) {
        sections.push(`### Recent errors\n\n${errors}`);
      }
    }

    if (input.includeDiagnostics) {
      const diagnostics = this.formatDiagnostics();
      if (diagnostics) {
        sections.push(`### Recent diagnostics\n\n${diagnostics}`);
      }
    }

    sections.push(
      '---\n_Filed from the in-app bug reporter. Nothing was sent automatically; ' +
        'this report is only what you see here._',
    );

    return sections.join('\n\n');
  }

  /** A short, sensible issue title derived from the description. */
  buildTitle(input: BugReportInput): string {
    const first = input.description.trim().split('\n')[0]?.trim() ?? '';
    const short = first.length > 72 ? `${first.slice(0, 69)}…` : first;
    return short ? `Bug: ${short}` : 'Bug report';
  }

  /**
   * A github.com/.../issues/new link with title and body prefilled. The user
   * still reviews and submits on GitHub — nothing is filed automatically. Body
   * is truncated if the URL would get too long for GitHub to accept.
   */
  buildGithubUrl(input: BugReportInput): string {
    const title = this.buildTitle(input);
    let body = this.buildMarkdown(input);
    if (body.length > MAX_BODY_LEN) {
      body =
        body.slice(0, MAX_BODY_LEN) +
        '\n\n_…truncated for the URL. Paste the full report from your clipboard if needed._';
    }
    const params = new URLSearchParams({ title, body });
    return `https://github.com/${REPO}/issues/new?${params.toString()}`;
  }

  private environmentTable(): string {
    const linked = this.providers.linked();
    const rows: [string, string][] = [
      ['App', environment.brand],
      ['Version', BUILD_INFO.commit ? BUILD_INFO.commit.slice(0, 7) : 'dev (unstamped)'],
      ['Built', BUILD_INFO.builtAt ?? '—'],
      ['Build log', BUILD_INFO.runUrl ?? '—'],
      ['Instance', this.server.isMock ? 'mock (this server)' : this.server.baseUrl()],
      ['Connected', linked.length ? linked.map((p) => p.label).join(', ') : 'none'],
      ['Page', this.safeLocation()],
      ['Browser', navigator.userAgent],
    ];
    return rows.map(([k, v]) => `- **${k}:** ${v}`).join('\n');
  }

  private formatErrors(): string {
    const entries = this.errorLog.entries();
    if (entries.length === 0) {
      return '';
    }
    const body = entries
      .map((e) => `[+${(e.at / 1000).toFixed(1)}s ${e.source}] ${e.text}`)
      .join('\n\n');
    return '```\n' + body + '\n```';
  }

  private formatDiagnostics(): string {
    const entries = this.diagnosticLog.entries().slice(-100);
    if (entries.length === 0) {
      return '';
    }
    return '```\n' + entries.map(formatDiagnosticEntry).join('\n') + '\n```';
  }

  /** Current path only; query strings and fragments can both carry tokens. */
  private safeLocation(): string {
    return location.pathname;
  }
}
