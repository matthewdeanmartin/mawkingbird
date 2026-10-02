import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionMataroa } from './connection-mataroa';
import { MataroaSettings } from '../../../../providers/mataroa/mataroa-settings';
import { MataroaApi } from '../../../../providers/mataroa/mataroa-api';
import { CorsProxy } from '../../../../providers/cors-proxy/cors-proxy';
import { ProxyConsent } from '../../../../providers/proxy-consent-store';
import { VaultBridge } from '../../../../providers/vault/vault-bridge';

describe('Mataroa shared credential and consent controls', () => {
  const connect = vi.fn(),
    disconnect = vi.fn(),
    grant = vi.fn(),
    revoke = vi.fn();
  let probe: Subject<unknown[]>;
  beforeEach(() => {
    vi.clearAllMocks();
    probe = new Subject();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: MataroaSettings,
          useValue: {
            connected: signal(false),
            blogUrl: () => '',
            includeInProfile: () => false,
            enforceLifetime: vi.fn(),
            connect,
            disconnect,
          },
        },
        { provide: MataroaApi, useValue: { listPosts: () => probe } },
        {
          provide: CorsProxy,
          useValue: {
            entry: () => ({ id: 'custom', label: 'Preview proxy', forwardsCustomHeaders: true }),
            available: () => true,
          },
        },
        { provide: ProxyConsent, useValue: { grant, revoke } },
        { provide: VaultBridge, useValue: { syncs: () => false } },
      ],
    });
  });

  async function setup() {
    const fixture = TestBed.createComponent(ConnectionMataroa);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    for (const [name, value] of [
      ['apiKey', 'candidate'],
      ['blogUrl', 'https://preview.mataroa.blog'],
    ]) {
      const input = root.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
      expect(input.labels?.[0]?.textContent?.trim()).toBeTruthy();
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, root };
  }

  it('requires a separate explicit proxy checkbox before storing or sending a credential', async () => {
    const { fixture, root } = await setup();
    const submit = root.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const checkboxes = root.querySelectorAll<HTMLInputElement>('mb-checkbox input');
    expect(submit.disabled).toBe(true);
    checkboxes[0].click();
    fixture.detectChanges();
    expect(submit.disabled).toBe(true);
    expect(grant).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    checkboxes[1].click();
    fixture.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(connect).toHaveBeenCalledWith('candidate', 'https://preview.mataroa.blog', true);
    expect(grant).toHaveBeenCalledWith('mataroa', 'custom');
    expect(submit.disabled).toBe(true);
  });

  it('revokes consent and rolls back settings after a rejected probe', async () => {
    const { fixture, root } = await setup();
    root.querySelectorAll<HTMLInputElement>('mb-checkbox input')[1].click();
    fixture.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    probe.error(new Error('Rejected fixture key'));
    fixture.detectChanges();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('mataroa', 'custom');
    expect(root.querySelector<HTMLInputElement>('input[name="apiKey"]')!.value).toBe('candidate');
    expect(root.querySelector('mb-notice [role="alert"]')?.textContent).toContain(
      'Rejected fixture key',
    );
  });
});
