import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../auth';
import { ClientPrefs } from '../client-prefs';
import { FeatureFlags } from '../feature-flags';
import { UiLocale } from '../i18n/locale';
import { SupporterStatus } from '../providers/account/supporter-status';
import { AnonymousFollows } from '../providers/anonymous/anonymous-follows';
import { BlueskySession } from '../providers/bluesky/bluesky-session';
import { MastodonConnector } from '../providers/mastodon/mastodon-connector';
import { Pseudonymity } from '../pseudonymity';
import { KnownLanguages } from '../trend-language-filter';
import { TrustedAccounts } from '../trusted-accounts';
import {
  ONBOARDING_QUESTIONS,
  OnboardingContext,
  OnboardingServer,
  ServerSettings,
} from './onboarding-questions';

const question = (id: string) => {
  const found = ONBOARDING_QUESTIONS.find((q) => q.id === id);
  if (!found) throw new Error(`no question ${id}`);
  return found;
};

function context(server: ServerSettings | null = null): OnboardingContext {
  const state = signal(server);
  return {
    auth: TestBed.inject(Auth),
    prefs: TestBed.inject(ClientPrefs),
    pseudonymity: TestBed.inject(Pseudonymity),
    trust: TestBed.inject(TrustedAccounts),
    flags: TestBed.inject(FeatureFlags),
    bsky: TestBed.inject(BlueskySession),
    connector: TestBed.inject(MastodonConnector),
    anonFollows: TestBed.inject(AnonymousFollows),
    supporter: TestBed.inject(SupporterStatus),
    locale: TestBed.inject(UiLocale),
    known: TestBed.inject(KnownLanguages),
    server: {
      state,
      write: async (field, value) => state.update((s) => (s ? { ...s, [field]: value } : s)),
    } as OnboardingServer,
    wantsLearning: signal(false),
  };
}

const visible = (ctx: OnboardingContext) =>
  ONBOARDING_QUESTIONS.filter((q) => q.when(ctx)).map((q) => q.id);

const SERVER: ServerSettings = {
  locked: false,
  discoverable: true,
  privacy: 'public',
  language: '',
};

describe('onboarding questions', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  describe('signed in to Mastodon', () => {
    beforeEach(() => {
      localStorage.setItem('mastodon_mock_account_mode', 'mastodon');
      localStorage.setItem('mastodon_mock_token', 'alice-token');
    });

    it('asks pseudonymity first, and a yes opens the lock-down cards', () => {
      const ctx = context(SERVER);
      expect(visible(ctx)[0]).toBe('pseudonymous');
      expect(visible(ctx)).not.toContain('pa-locked');

      question('pseudonymous').apply?.(ctx, 'yes');

      expect(visible(ctx)).toEqual(
        expect.arrayContaining(['pa-locked', 'pa-discoverable', 'pa-clean', 'pa-reminder']),
      );
      expect(question('pa-locked').suggest?.(ctx)).toBe(true);
      expect(question('visibility').suggest?.(ctx)).toBe('private');
    });

    it('writes "keep me out of suggestions" as discoverable = false', async () => {
      const ctx = context(SERVER);
      await question('pa-discoverable').apply?.(ctx, true);
      expect(ctx.server.state()?.discoverable).toBe(false);
      expect(question('pa-discoverable').read?.(ctx)).toBe(true);
    });

    it('hides server cards until the server settings have loaded', () => {
      const ctx = context(null);
      question('pseudonymous').apply?.(ctx, 'yes');
      expect(visible(ctx)).not.toContain('pa-locked');
      expect(visible(ctx)).not.toContain('visibility');
      expect(visible(ctx)).toContain('pa-clean');
    });
  });

  it('offers no pseudonymity or server cards to the Anonymous account', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const ids = visible(context(SERVER));
    for (const id of ['pseudonymous', 'pa-locked', 'visibility', 'post-language']) {
      expect(ids).not.toContain(id);
    }
    expect(ids).toContain('theme');
  });

  it('leaves at most one posting-pace setting on', () => {
    const ctx = context();
    ctx.prefs.setConfirmBeforePost(true);
    ctx.prefs.setDelayedSend(true);
    const pace = question('posting-pace');
    expect(pace.read?.(ctx)).toBe('delay');

    pace.apply?.(ctx, 'confirm');
    expect([
      ctx.prefs.confirmBeforePost(),
      ctx.prefs.delayedSend(),
      ctx.prefs.thoughtfulPosting(),
    ]).toEqual([true, false, false]);
  });

  it('opens the learning cards for multilingual readers only', () => {
    const ctx = context();
    ctx.prefs.setKnownLanguages(['en']);
    expect(visible(ctx)).not.toContain('learning');

    ctx.prefs.setKnownLanguages(['en', 'de']);
    expect(visible(ctx)).toContain('learning');
    expect(visible(ctx)).not.toContain('learning-help');

    question('learning').apply?.(ctx, ['de']);
    expect(ctx.prefs.knownLanguages()).toEqual(['en']);
    expect(visible(ctx)).toEqual(expect.arrayContaining(['learning-help', 'auto-translate']));
  });

  it('shows the Plus card only when the Plus flag is on', () => {
    const ctx = context();
    ctx.flags.setState('mawkingbird-plus', 'off');
    expect(visible(ctx)).not.toContain('plus');
    ctx.flags.setState('mawkingbird-plus', 'production');
    expect(visible(ctx)).toContain('plus');
  });

  it('keeps every card to a short question and at most two sentences', () => {
    const ctx = context(SERVER);
    for (const q of ONBOARDING_QUESTIONS) {
      expect(q.title(ctx).length, q.id).toBeLessThanOrEqual(60);
      const help = q.help?.(ctx) ?? '';
      expect(help.split(/[.!?](\s|$)/).filter((s) => s.trim()).length, q.id).toBeLessThanOrEqual(2);
    }
  });
});
