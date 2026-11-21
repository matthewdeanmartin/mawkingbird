import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyContactApi } from '../../connections/bluesky/bluesky-contact-api';
import { BlueskyGraph } from '../../connections/bluesky/bluesky-graph';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { AppDialogs } from '../../shell/app-dialogs';
import { BlueskyFindContacts } from './bluesky-find-contacts';

describe('Find people you know on Bluesky', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let confirm: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    api = {
      status: vi.fn(async () => null),
      matches: vi.fn(async () => []),
      startVerification: vi.fn(async () => undefined),
      verify: vi.fn(async () => 'token-1'),
      importContacts: vi.fn(async () => [{ did: 'did:plc:ana', handle: 'ana.test' }]),
      removeData: vi.fn(async () => undefined),
    };
    confirm = vi.fn(async () => true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BlueskyContactApi, useValue: api },
        { provide: BlueskyGraph, useValue: {} },
        {
          provide: BlueskySession,
          useValue: { linked: () => true, session: () => ({ did: 'did:plc:me' }) },
        },
        { provide: AppDialogs, useValue: { confirm } },
      ],
    });
  });

  interface Page {
    country: { set(v: string): void };
    phone: { set(v: string): void };
    code: { set(v: string): void };
    pasted: { set(v: string): void };
    numbers(): string[];
    error(): string;
    matches(): { did: string }[];
    sendCode(): Promise<void>;
    verify(): Promise<void>;
    importContacts(): Promise<void>;
    removeData(): Promise<void>;
  }

  function page(): Page {
    const fixture = TestBed.createComponent(BlueskyFindContacts);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Page;
  }

  it('confirms the number, then imports normalized contacts without the reader’s own', async () => {
    const p = page();
    p.country.set('GB');
    p.phone.set('07700 900123');
    await p.sendCode();
    expect(api['startVerification']).toHaveBeenCalledWith('+447700900123');
    p.code.set(' 123456 ');
    await p.verify();
    expect(api['verify']).toHaveBeenCalledWith('+447700900123', ' 123456 ');

    p.pasted.set('07700 900123\n07700 900456\n+1 555 010 4477');
    expect(p.numbers()).toEqual(['+447700900456', '+15550104477']);
    await p.importContacts();
    expect(api['importContacts']).toHaveBeenCalledWith('token-1', [
      '+447700900456',
      '+15550104477',
    ]);
    expect(p.matches().map((m) => m.did)).toEqual(['did:plc:ana']);
    expect(p.numbers()).toEqual([]);
  });

  it('refuses a number that cannot be one, before sending anything', async () => {
    const p = page();
    p.phone.set('12');
    await p.sendCode();
    expect(api['startVerification']).not.toHaveBeenCalled();
    expect(p.error()).toContain("doesn't look like a phone number");
  });

  it('removes the contact data only after asking', async () => {
    const p = page();
    confirm.mockResolvedValueOnce(false);
    await p.removeData();
    expect(api['removeData']).not.toHaveBeenCalled();
    await p.removeData();
    expect(api['removeData']).toHaveBeenCalledOnce();
  });
});
