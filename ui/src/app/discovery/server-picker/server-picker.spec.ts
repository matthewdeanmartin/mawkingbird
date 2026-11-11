import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MastodonServers, ServerSuggestion } from '../mastodon-servers';
import { ServerPicker } from './server-picker';

interface PickerInternals {
  customServer: (v?: string) => string;
  serverStatus: () => string;
  serverSuggestions: () => ServerSuggestion[];
  suggestOpen: () => boolean;
  onServerInput(v: string): void;
  chooseSuggestion(s: ServerSuggestion): void;
  applyServerNow(): void;
  useDegradedServer(): void;
}

function internals(cmp: ServerPicker): PickerInternals {
  return cmp as unknown as PickerInternals;
}

/** Drain enough microtask turns for the probe's fetch + res.json() chain. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

const SUGGESTION: ServerSuggestion = {
  domain: 'mstdn.social',
  description: 'A general instance',
  category: 'general',
  users: 50_000,
};

describe('ServerPicker', () => {
  let fakeServers: { search: ReturnType<typeof vi.fn>; ensureLoaded: ReturnType<typeof vi.fn> };

  it('supports keyboard option navigation, Escape and explicit selection', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ title: 'Selected server' }) });
    vi.stubGlobal('fetch', fetch);
    fakeServers.search.mockReturnValue([SUGGESTION, { ...SUGGESTION, domain: 'second.example' }]);
    const fixture = TestBed.createComponent(ServerPicker);
    const picked = vi.fn();
    fixture.componentInstance.picked.subscribe(picked);
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.dispatchEvent(new Event('focus'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    const options = fixture.nativeElement.querySelectorAll('[role="option"]');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await fixture.whenStable();
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    await flush();
    await fixture.whenStable();
    expect(picked).toHaveBeenCalledExactlyOnceWith('https://second.example');
    expect(input.value).toBe('second.example');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('assigns independent listbox IDs when multiple pickers are rendered', async () => {
    const first = TestBed.createComponent(ServerPicker);
    const second = TestBed.createComponent(ServerPicker);
    await first.whenStable();
    await second.whenStable();
    const firstInput: HTMLInputElement = first.nativeElement.querySelector('input');
    const secondInput: HTMLInputElement = second.nativeElement.querySelector('input');
    firstInput.dispatchEvent(new Event('focus'));
    secondInput.dispatchEvent(new Event('focus'));
    await first.whenStable();
    await second.whenStable();
    expect(firstInput.getAttribute('aria-controls')).not.toBe(
      secondInput.getAttribute('aria-controls'),
    );
    expect(first.nativeElement.querySelector('[role="listbox"]').id).toBe(
      firstInput.getAttribute('aria-controls'),
    );
    expect(second.nativeElement.querySelector('[role="listbox"]').id).toBe(
      secondInput.getAttribute('aria-controls'),
    );
  });

  beforeEach(() => {
    fakeServers = {
      search: vi.fn().mockReturnValue([SUGGESTION]),
      ensureLoaded: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [ServerPicker],
      providers: [{ provide: MastodonServers, useValue: fakeServers }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function create(): ServerPicker {
    const fixture = TestBed.createComponent(ServerPicker);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('warms the server index on init', () => {
    create();
    expect(fakeServers.ensureLoaded).toHaveBeenCalled();
  });

  it('surfaces curated suggestions as the user types', () => {
    const cmp = create();
    internals(cmp).onServerInput('mstdn');
    expect(internals(cmp).serverSuggestions()).toEqual([SUGGESTION]);
  });

  it('emits picked with a normalized base URL when a probed server is reachable', async () => {
    const cmp = create();
    const emitted: string[] = [];
    cmp.picked.subscribe((url) => emitted.push(url));

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ title: 'Mastodon' }), { status: 200 }));

    internals(cmp).chooseSuggestion(SUGGESTION);
    // Let the probe's fetch + res.json() promises settle.
    await flush();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://mstdn.social/api/v1/instance',
      expect.anything(),
    );
    expect(internals(cmp).serverStatus()).toBe('ok');
    expect(emitted).toEqual(['https://mstdn.social']);
  });

  it('marks a server unreachable and does not emit when the probe fails', async () => {
    const cmp = create();
    const emitted: string[] = [];
    cmp.picked.subscribe((url) => emitted.push(url));

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));

    internals(cmp).chooseSuggestion(SUGGESTION);
    await flush();

    expect(internals(cmp).serverStatus()).toBe('unreachable');
    expect(emitted).toEqual([]);
  });

  it('warns about a blocked media host and waits for explicit acceptance', async () => {
    const cmp = create();
    const emitted: string[] = [];
    cmp.picked.subscribe((url) => emitted.push(url));
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            title: 'Degraded',
            contact_account: { avatar_static: 'https://cdn.example/avatar.png' },
          }),
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(new Error('blocked'));

    internals(cmp).onServerInput('degraded.example');
    internals(cmp).applyServerNow();
    await flush();

    expect(internals(cmp).serverStatus()).toBe('degraded');
    expect(emitted).toEqual([]);
    internals(cmp).useDegradedServer();
    expect(emitted).toEqual(['https://degraded.example']);
  });
  it('waits for an explicit action before connecting to a typed local server', async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ title: 'Mastomini' }) });
      vi.stubGlobal('fetch', fetch);
      const cmp = create();
      internals(cmp).onServerInput('mastomini.local');
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetch).not.toHaveBeenCalled();
      expect(internals(cmp).serverStatus()).toBe('idle');
      internals(cmp).applyServerNow();
      await flush();
      expect(fetch).toHaveBeenCalledWith(
        'https://mastomini.local/api/v1/instance',
        expect.any(Object),
      );
      expect(internals(cmp).serverStatus()).toBe('ok');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a slow probe when the input changes and ignores its late result', async () => {
    let finish!: (value: unknown) => void;
    const fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const cmp = create();
    internals(cmp).chooseSuggestion({ ...SUGGESTION, domain: 'mastomini.local' });
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    internals(cmp).onServerInput('new');
    expect(signal.aborted).toBe(true);
    finish({ ok: true, json: async () => ({ title: 'Old server' }) });
    await flush();
    expect(internals(cmp).serverStatus()).toBe('idle');
  });
});
