import { signal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionGitHub } from './github/connection-github';
import { ConnectionGist } from './gist/connection-gist';
import { ConnectionRaindrop } from './raindrop/connection-raindrop';
import { GitHubSession } from '../../../providers/github/github-session';
import { GistSettings } from '../../../providers/paste/gist-settings';
import { GistProvider } from '../../../providers/paste/gist-provider';
import { RaindropSession } from '../../../providers/raindrop/raindrop-session';
import { VaultBridge } from '../../../providers/vault/vault-bridge';
import { PageDiagnostics } from '../../../page-diagnostics';

describe('Token connection shared controls', () => {
  const connected = signal(false);
  const connect = vi.fn();
  let identity: Subject<{ login: string }>;
  const whoami = vi.fn();

  beforeEach(() => {
    connected.set(false);
    connect.mockReset();
    identity = new Subject();
    whoami.mockReset().mockReturnValue(identity);
    const session = {
      connected,
      enforceLifetime: vi.fn(),
      needsFetch: () => false,
      expiresAt: () => null,
      connect,
      disconnect: vi.fn(),
      profile: () => null,
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: GitHubSession, useValue: session },
        { provide: GistSettings, useValue: session },
        { provide: RaindropSession, useValue: session },
        { provide: GistProvider, useValue: { whoami } },
        { provide: VaultBridge, useValue: { syncs: () => false } },
        { provide: PageDiagnostics, useValue: { error: vi.fn() } },
      ],
    });
  });

  for (const component of [ConnectionGitHub, ConnectionGist, ConnectionRaindrop]) {
    it(`${component.name} labels its native password control and uses shared actions`, async () => {
      const fixture = TestBed.createComponent(component as Type<unknown>);
      fixture.detectChanges();
      await fixture.whenStable();
      const root: HTMLElement = fixture.nativeElement;
      const input = root.querySelector<HTMLInputElement>('mb-field input')!;
      expect(input.type).toBe('password');
      expect(input.autocomplete).toBe('off');
      expect(input.labels?.[0]?.textContent?.trim()).toBeTruthy();
      expect(root.querySelector('h1')).not.toBeNull();
      expect(root.querySelectorAll('button:not([mbButton])')).toHaveLength(0);
      expect(root.querySelector('mb-notice [role]')).toBeNull();
    });
  }

  it('Gist validates before storing, retains rejected input, and disables repeat clicks', async () => {
    const fixture = TestBed.createComponent(ConnectionGist);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const input = root.querySelector<HTMLInputElement>('input')!;
    input.value = 'candidate-token';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const button = root.querySelector<HTMLButtonElement>('button')!;
    button.click();
    fixture.detectChanges();
    expect(whoami).toHaveBeenCalledWith('candidate-token');
    expect(connect).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);
    identity.error(new Error('Rejected'));
    fixture.detectChanges();
    expect(connect).not.toHaveBeenCalled();
    expect(input.value).toBe('candidate-token');
    expect(
      [...root.querySelectorAll('[role="alert"]')].filter((region) => region.textContent?.trim()),
    ).toHaveLength(1);
    expect(button.disabled).toBe(false);
  });

  it('Gist saves a verified identity then clears the credential field', async () => {
    const fixture = TestBed.createComponent(ConnectionGist);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const input = root.querySelector<HTMLInputElement>('input')!;
    input.value = 'candidate-token';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('button')!.click();
    identity.next({ login: 'preview' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(connect).toHaveBeenCalledWith('candidate-token', { login: 'preview' });
    expect(input.value).toBe('');
    expect(
      [...root.querySelectorAll('[role="status"]')].filter((region) => region.textContent?.trim()),
    ).toHaveLength(1);
  });
});
