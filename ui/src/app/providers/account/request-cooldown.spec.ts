import { afterEach, expect, it, vi } from 'vitest';
import { RequestCooldown } from './request-cooldown';

afterEach(() => vi.restoreAllMocks());

it('backs off failures, respects Retry-After, and resets after success', () => {
  let now = 1_800_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const cooldown = new RequestCooldown();
  cooldown.fail();
  expect(cooldown.blocked()).toBe(true);
  now += 30_000;
  expect(cooldown.blocked()).toBe(false);
  cooldown.fail(429, '120');
  now += 60_000;
  expect(cooldown.blocked()).toBe(true);
  now += 60_000;
  expect(cooldown.blocked()).toBe(false);
  cooldown.success();
  cooldown.fail();
  now += 30_000;
  expect(cooldown.blocked()).toBe(false);
});

it('cools permanent refusals for fifteen minutes without scheduling retries', () => {
  let now = 1_800_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const cooldown = new RequestCooldown();
  cooldown.fail(403);
  now += 60_000;
  expect(cooldown.blocked()).toBe(true);
  now += 14 * 60_000;
  expect(cooldown.blocked()).toBe(false);
});
