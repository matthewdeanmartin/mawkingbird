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
});
