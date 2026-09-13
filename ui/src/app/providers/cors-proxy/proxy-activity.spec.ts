import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProxyActivity, PROXY_PAUSED_KEY, PROXY_PROMPT_KEY } from './proxy-activity';
describe('ProxyActivity', () => {
  beforeEach(() => {
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
});
