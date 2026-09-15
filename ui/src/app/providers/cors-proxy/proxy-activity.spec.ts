import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProxyActivity, PROXY_PAUSED_KEY, PROXY_PROMPT_KEY } from './proxy-activity';
describe('ProxyActivity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.removeItem(PROXY_PAUSED_KEY);
    sessionStorage.removeItem(PROXY_PROMPT_KEY);
  });
  afterEach(() => {
    localStorage.removeItem(PROXY_PAUSED_KEY);
    sessionStorage.removeItem(PROXY_PROMPT_KEY);
    vi.useRealTimers();
  });
  it('shows one prompt despite concurrent failures, dismissal, and reload', () => {
    const activity = new ProxyActivity();
    activity.exhausted('60', true);
    activity.exhausted('60', true);
    expect(activity.claimPrompt()).toBe(true);
    expect(activity.claimPrompt()).toBe(false);
    const reloaded = new ProxyActivity();
    reloaded.exhausted('60', true);
    expect(reloaded.claimPrompt()).toBe(false);
  });
  it('rate-limits paid callers without offering an upgrade', () => {
    const activity = new ProxyActivity();
    activity.exhausted('60', false);
    expect(activity.claimPrompt()).toBe(false);
    expect(() => activity.assertAllowed()).toThrow();
  });
  it('blocks requests until retry time and allows them afterward', () => {
    vi.useFakeTimers();
    const activity = new ProxyActivity();
    activity.exhausted('10', true);
    expect(() => activity.assertAllowed()).toThrow();
    vi.advanceTimersByTime(10_001);
    expect(() => activity.assertAllowed()).not.toThrow();
    expect(activity.claimPrompt()).toBe(false);
  });
  it('persists a reversible pause without erasing other stored data', () => {
    const activity = new ProxyActivity();
    activity.setPaused(true);
    expect(new ProxyActivity().paused()).toBe(true);
    expect(() => activity.assertAllowed()).toThrow();
    activity.setPaused(false);
    expect(() => activity.assertAllowed()).not.toThrow();
    expect(new ProxyActivity().paused()).toBe(false);
  });
  it('dismisses without disabling and does not reopen for concurrent failures', () => {
    const activity = new ProxyActivity();
    activity.exhausted('10', true);
    activity.dismissNotice();
    activity.exhausted('10', true);
    expect(activity.notice()).toBe(false);
    expect(activity.paused()).toBe(false);
    expect(() => activity.assertAllowed()).toThrow();
    vi.advanceTimersByTime(10_000);
    expect(activity.remainingSeconds()).toBe(0);
    expect(() => activity.assertAllowed()).not.toThrow();
    activity.exhausted('10', true);
    expect(activity.notice()).toBe(true);
  });
  it('clears the notice automatically and keeps independent route cooldowns', () => {
    const activity = new ProxyActivity();
    activity.exhausted('10', true, { cause: 'caller_allowance', scope: 'route', route: 'feeds' });
    activity.exhausted('20', true, { cause: 'caller_allowance', scope: 'route', route: 'article' });
    expect(() => activity.assertAllowed('feeds')).toThrow();
    expect(() => activity.assertAllowed('pastes')).not.toThrow();
    vi.advanceTimersByTime(10_000);
    expect(() => activity.assertAllowed('feeds')).not.toThrow();
    expect(() => activity.assertAllowed('article')).toThrow();
    expect(activity.notice()).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(activity.notice()).toBe(false);
    expect(activity.upgradeEligible()).toBe(false);
  });
  it.each(['service_capacity', 'upstream', 'unknown'] as const)(
    'never upsells %s limits',
    (cause) => {
      const activity = new ProxyActivity();
      activity.exhausted('10', true, { cause, scope: 'all_routes' });
      expect(activity.notice()).toBe(true);
      expect(activity.upgradeEligible()).toBe(false);
      expect(activity.claimPrompt()).toBe(false);
    },
  );
  it('honors HTTP-date retry timing and defaults invalid timing to a minute', () => {
    const activity = new ProxyActivity();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
    activity.exhausted('Tue, 15 Sep 2026 12:00:15 GMT', true);
    expect(activity.remainingSeconds()).toBe(15);
    vi.advanceTimersByTime(15_000);
    activity.exhausted('invalid', true);
    expect(activity.remainingSeconds()).toBe(60);
  });
});
