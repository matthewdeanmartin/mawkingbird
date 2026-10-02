import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../../../auth';
import { Api } from '../../../../api';
import { Server } from '../../../../server';
import { MastodonConnector } from '../../../../providers/mastodon/mastodon-connector';
import { ConnectionMastodon } from './connection-mastodon';

describe('ConnectionMastodon shared credential form', () => {
  let verification: Subject<unknown>;
  const disconnect = vi.fn();
  const signIn = vi.fn();
  const connect = vi.fn();

  beforeEach(() => {
    verification = new Subject();
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Auth,
          useValue: {
            isBlueskyPrimary: true,
            connectMastodon: connect,
            disconnectMastodon: disconnect,
          },
        },
        { provide: Api, useValue: { verifyCredentials: () => verification } },
        { provide: Server, useValue: { setBaseUrl: vi.fn() } },
        {
          provide: MastodonConnector,
          useValue: {
            current: signal({ state: 'anonymous' }),
            server: () => 'https://example.test',
            signIn,
          },
        },
      ],
    });
  });

  async function submit() {
    const fixture = TestBed.createComponent(ConnectionMastodon);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const input = root.querySelector<HTMLInputElement>('mb-field input')!;
    expect(input.labels?.[0]?.textContent?.trim()).toBe('access token');
    input.value = 'candidate';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    return { fixture, root, input };
  }

  it('rolls a rejected token out of Auth and preserves the draft for correction', async () => {
    const { fixture, root, input } = await submit();
    expect(connect).toHaveBeenCalledWith('candidate');
    expect(input.disabled).toBe(true);
    expect(signIn).not.toHaveBeenCalled();
    verification.error(new Error('Rejected'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(signIn).not.toHaveBeenCalled();
    expect(input.value).toBe('candidate');
    expect(input.disabled).toBe(false);
    expect(root.querySelector('mb-notice [role="alert"]')?.textContent).toContain(
      'Signing in failed',
    );
  });

  it('keeps the connector anonymous until verification succeeds', async () => {
    const { fixture, root, input } = await submit();
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(connect).toHaveBeenCalledOnce();
    expect(signIn).not.toHaveBeenCalled();
    verification.next({ id: 'verified' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(signIn).toHaveBeenCalledWith('candidate', 'https://example.test', { id: 'verified' });
    expect(input.value).toBe('');
  });
});
