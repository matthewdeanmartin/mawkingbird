import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbDiscoveryCandidate } from '../../design-system/identity/discovery-candidate';
import snapshot from './signup-servers.json';

/*
 * English only until the new-account feature settles (owner, 2026-11-18).
 * spec/new-account-setup.md § SEO page.
 */

export interface SignupServer {
  domain: string;
  description: string;
  lastWeekUsers: number;
  approvalRequired: boolean;
  version: string;
}

export const SIGNUP_SERVERS = snapshot.languages as Record<string, SignupServer[]>;
export const SIGNUP_SERVERS_CHECKED_ON = snapshot.checkedOn;

/** Each offered language by its own name. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  nl: 'Nederlands',
  pt: 'Português',
  pl: 'Polski',
};

/** The first browser language that has a list, else English. */
export function defaultSignupLanguage(preferred: readonly string[]): string {
  for (const tag of preferred) {
    const code = tag.toLowerCase().split(/[-_]/)[0];
    if (SIGNUP_SERVERS[code]) return code;
  }
  return 'en';
}

/** "about 40,000 active", rounded so the number reads as a size, not a statistic. */
export function activeLabel(users: number): string {
  if (users < 1000) return 'a few hundred active';
  const rounded = users >= 10000 ? Math.round(users / 1000) * 1000 : Math.round(users / 100) * 100;
  return `about ${rounded.toLocaleString('en')} active each week`;
}

/**
 * /create-mastodon-account/: a complete answer to "how do I create a Mastodon
 * account", then a short list of big, open, general servers in the reader's
 * language. Owner rule: start people on a big general server; small and topic
 * servers are for second accounts. Never show the whole directory.
 *
 * The page prerenders with the English list. In the browser it switches to the
 * reader's language. Choosing a server goes through /create-mastodon-account/go/
 * (counted by GoatCounter) to the sign-in page, which starts the sign-up.
 */
@Component({
  selector: 'app-create-account',
  imports: [RouterLink, MbButton, MbCheckbox, MbField, MbControl, MbDiscoveryCandidate],
  templateUrl: './create-account.html',
  styleUrl: './create-account.css',
})
export class CreateAccount {
  protected readonly checkedOn = SIGNUP_SERVERS_CHECKED_ON;
  protected readonly languages = Object.keys(SIGNUP_SERVERS).map((code) => ({
    code,
    name: LANGUAGE_NAMES[code] ?? code.toUpperCase(),
  }));
  protected readonly language = signal(
    isPlatformBrowser(inject(PLATFORM_ID))
      ? defaultSignupLanguage(navigator.languages ?? [navigator.language])
      : 'en',
  );
  /** Servers that review each new account are hidden unless asked for. */
  protected readonly showApproval = signal(false);
  protected readonly servers = computed(() =>
    (SIGNUP_SERVERS[this.language()] ?? []).filter(
      (s) => this.showApproval() || !s.approvalRequired,
    ),
  );
  protected readonly hiddenCount = computed(
    () => (SIGNUP_SERVERS[this.language()] ?? []).filter((s) => s.approvalRequired).length,
  );
  protected readonly active = activeLabel;
}
