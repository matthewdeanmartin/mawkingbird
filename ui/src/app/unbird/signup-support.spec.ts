import { describe, expect, it, vi } from 'vitest';
import { probeSignup, registrationState, supportsCreatePrompt } from './signup-support';

describe('sign-up support', () => {
  it('offers sign-up-then-return from Mastodon 5.0 on', () => {
    expect(supportsCreatePrompt('5.0.0')).toBe(true);
    expect(supportsCreatePrompt('5.1.2+glitch')).toBe(true);
    expect(supportsCreatePrompt('4.4.3')).toBe(false);
    expect(supportsCreatePrompt(null)).toBe(false);
    expect(supportsCreatePrompt('nonsense')).toBe(false);
  });

  it('reads whether a server is open, reviewing, or closed', () => {
    expect(registrationState({ enabled: true, approval_required: false })).toBe('open');
    expect(registrationState({ enabled: true, approval_required: true })).toBe('approval');
    expect(registrationState({ enabled: false })).toBe('closed');
    expect(registrationState(undefined)).toBeNull();
  });

  it("probes the server's public instance document without credentials", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        version: '5.0.1',
        registrations: { enabled: true, approval_required: false },
      }),
    );
    expect(await probeSignup('https://hachyderm.io/', fetchImpl)).toEqual({
      createPrompt: true,
      registrations: 'open',
      version: '5.0.1',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://hachyderm.io/api/v2/instance',
      expect.objectContaining({ credentials: 'omit' }),
    );
  });

  it('answers unknown, never throws, when the server cannot be asked', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await probeSignup('https://down.example', failing)).toEqual({
      createPrompt: false,
      registrations: null,
      version: null,
    });
    expect(await probeSignup('http://insecure.example', failing)).toMatchObject({
      createPrompt: false,
    });
    expect(failing).toHaveBeenCalledTimes(1);
  });
});
