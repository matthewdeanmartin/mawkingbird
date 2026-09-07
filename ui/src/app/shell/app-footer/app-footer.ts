import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Auth } from '../../auth';
import { BugReportDialog } from '../../bug-report-dialog/bug-report-dialog';
import { BUILD_INFO } from '../../build-info';
import { Hotkeys } from '../../hotkeys';
import { Server } from '../../server';
import { LocalePicker } from '../../locale-picker/locale-picker';

/**
 * The end-of-feed footer. Feeds here are finite, so there is a bottom — and a
 * bottom deserves a footer: instance rules, the client's source, and a whale.
 */
/**
 * English source strings for this component.
 *
 * `public/i18n/en.json` is generated from these by `scripts/extract-i18n.mjs` —
 * edit the comment, never the JSON. They live here so a reader of the template
 * can see what the keys say without opening the dictionary.
 */
// i18n footer.rules: {{host}} rules & terms
// i18n footer.server: Server
// i18n footer.source: Mawkingbird source
// i18n footer.reportBug: Report a bug
// i18n footer.privacy: Privacy
// i18n footer.failWhale: Fail whale
// i18n footer.hotkeys: ? for keyboard
// i18n footer.hotkeys.title: Keyboard shortcuts (or press ? anywhere)
// i18n footer.end: You reached the end. That's allowed here.
// i18n footer.builtAt: Built {{date}} UTC
// i18n footer.buildLog: build log
@Component({
  selector: 'app-app-footer',
  imports: [DatePipe, RouterLink, BugReportDialog, TranslocoPipe, LocalePicker],
  template: `
    <footer class="app-footer muted">
      <a [href]="aboutUrl()" target="_blank" rel="noopener noreferrer">
        {{ 'footer.rules' | transloco: { host: host() || ('footer.server' | transloco) } }}
      </a>
      <span class="footer-separator" aria-hidden="true">·</span>
      <a
        href="https://github.com/matthewdeanmartin/mastodon_mock"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ 'footer.source' | transloco }}
      </a>
      <span class="footer-separator" aria-hidden="true">·</span>
      <button class="link" type="button" (click)="reporting.set(true)">
        {{ 'footer.reportBug' | transloco }}
      </button>
      <span class="footer-separator" aria-hidden="true">·</span>
      <a routerLink="/credits" fragment="privacy">{{ 'footer.privacy' | transloco }}</a>
      <span class="footer-separator" aria-hidden="true">·</span>
      <a routerLink="/fail-whale">{{ 'footer.failWhale' | transloco }}</a>
      <span class="footer-separator" aria-hidden="true">·</span>
      <button
        class="link"
        type="button"
        [title]="'footer.hotkeys.title' | transloco"
        (click)="hotkeys.helpOpen.set(true)"
      >
        {{ 'footer.hotkeys' | transloco }}
      </button>
      <app-locale-picker [footer]="true" />
      <p class="footer-note">{{ 'footer.end' | transloco }}</p>
      @if (build.builtAt) {
        <p class="build-info">
          {{
            'footer.builtAt'
              | transloco: { date: (build.builtAt | date: 'yyyy-MM-dd HH:mm' : 'UTC') }
          }}
          @if (build.commitUrl) {
            <span class="footer-separator" aria-hidden="true">·</span>
            <a [href]="build.commitUrl" target="_blank" rel="noopener noreferrer">
              {{ build.commit!.slice(0, 7) }}
            </a>
          }
          @if (build.runUrl) {
            <span class="footer-separator" aria-hidden="true">·</span>
            <a [href]="build.runUrl" target="_blank" rel="noopener noreferrer">
              {{ 'footer.buildLog' | transloco }}
            </a>
          }
        </p>
      }
    </footer>
    @if (reporting()) {
      <app-bug-report-dialog (closed)="reporting.set(false)" />
    }
  `,
  styles: `
    .app-footer {
      padding: 20px 16px 28px;
      border-top: 1px solid var(--border);
      font-size: 12.5px;
      text-align: center;
    }
    .app-footer a,
    .app-footer .link {
      color: var(--muted);
    }
    .footer-separator {
      display: inline-block;
      margin: 0 0.55em;
    }
    .app-footer a:hover,
    .app-footer .link:hover {
      color: var(--accent);
    }
    .app-footer .link {
      padding: 0;
      border: 0;
      background: none;
      font: inherit;
      cursor: pointer;
      text-decoration: underline;
    }
    .footer-note {
      margin: 8px 0 0;
      font-size: 11.5px;
    }
    .build-info {
      margin: 4px 0 0;
      font-size: 11px;
    }
  `,
})
export class AppFooter {
  private auth = inject(Auth);
  private server = inject(Server);
  /** Opens the same shortcut-help overlay the ? key does (rendered by Shell). */
  protected hotkeys = inject(Hotkeys);

  /** CI-stamped build metadata; the placeholder (null builtAt) hides the line. */
  protected build = BUILD_INFO;

  /** Whether the "Report a bug" dialog is open. */
  protected reporting = signal(false);

  /** Same home-host inference as the right rail's donate link. */
  protected host = computed<string | null>(() => {
    const acct = this.auth.account()?.acct ?? '';
    const at = acct.indexOf('@');
    if (at > 0) {
      return acct.slice(at + 1);
    }
    const base = this.server.baseUrl();
    return base ? base.replace(/^https?:\/\//, '') : null;
  });

  protected aboutUrl = computed<string>(() => {
    const host = this.host();
    return host ? `https://${host}/about` : '/about';
  });
}
