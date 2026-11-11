import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ShortenerRegistry } from '../shortener/shortener-registry';
import { ShortenerSettings } from '../shortener/shortener-settings';
import { CreateLinkInput, ShortLink } from '../shortener/shortener-provider';
import { parseMessageStatusRouteRef } from './message-payload';
import { PasteCreated } from './paste-provider';
import { ShortenerPasteProvider } from './shortener-paste-provider';

const INPUT = {
  title: 'a heading',
  content: 'posted without a server',
  language: 'plaintext',
  expiry: 'never',
  visibility: 'unlisted',
} as const;

const LINK: ShortLink = {
  provider: 'dub',
  providerId: 'link_123',
  shortUrl: 'https://dub.sh/abc123',
  destinationUrl: 'https://example.test/message/message-status.x',
  slug: 'abc123',
  raw: {},
};

/** A registry whose active provider and create() are both controllable. */
function setup(options: { active?: boolean; activeId?: string } = {}) {
  const active = options.active ?? true;
  const create = vi.fn((_input: CreateLinkInput) => of(LINK));
  const registry = { active: signal(active ? ({} as never) : null), create };
  const settings = {
    activeId: () => (active ? (options.activeId ?? 'dub') : null),
    blockedReason: () => (active ? null : 'Add your Dub API key to start shortening links.'),
  };

  // Each case configures its own registry stub, so the module from the previous
  // test has to go first — TestBed refuses to be reconfigured once instantiated.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: ShortenerRegistry, useValue: registry },
      { provide: ShortenerSettings, useValue: settings },
    ],
  });
  return { provider: TestBed.inject(ShortenerPasteProvider), create, registry };
}

describe('ShortenerPasteProvider', () => {
  it('is offered when a shortener is connected and usable', () => {
    expect(setup({ active: true }).provider.available()).toBe(true);
  });

  it('is withheld when nothing is connected, since it could only fail', () => {
    expect(setup({ active: false }).provider.available()).toBe(false);
  });

  it('names itself after the connected service, so the option is unambiguous', () => {
    // "Short link" next to "TinyURL link" tells you nothing about which is which.
    expect(setup({ activeId: 'dub' }).provider.label).toBe('Your Dub link');
  });

  it('names a different service differently', () => {
    expect(setup({ activeId: 'tly' }).provider.label).toBe('Your T.LY link');
  });

  it('shortens a query-free message URL carrying the post body', () => {
    const { provider, create } = setup();
    let result: PasteCreated | undefined;

    provider.create(INPUT).subscribe((created) => (result = created));

    const target = new URL(create.mock.calls[0][0].destinationUrl);
    expect(target.search).toBe('');
    expect(parseMessageStatusRouteRef(target.pathname.split('/').at(-1)!)).toEqual({
      content: 'posted without a server',
      spoiler: 'a heading',
      language: 'plaintext',
    });
    expect(result?.url).toBe('https://dub.sh/abc123');
    expect(result?.slug).toBe('abc123');
  });

  it('passes the spoiler as the link title, so it is findable on the Links page', () => {
    const { provider, create } = setup();

    provider.create(INPUT).subscribe();

    expect(create.mock.calls[0][0].title).toBe('a heading');
  });

  it('leaves an untitled message untitled rather than inventing one', () => {
    const { provider, create } = setup();

    provider.create({ ...INPUT, title: '   ' }).subscribe();

    expect(create.mock.calls[0][0].title).toBeUndefined();
  });

  it('goes through the registry, so the link lands in the Links page history', () => {
    // Calling the provider directly would create a link the user cannot find
    // again, and therefore cannot revoke.
    const { provider, create } = setup();

    provider.create(INPUT).subscribe();

    expect(create).toHaveBeenCalledOnce();
  });

  it('explains what to set up when nothing is connected', () => {
    const { provider } = setup({ active: false });
    let error: Error | undefined;

    provider.create(INPUT).subscribe({ error: (e: Error) => (error = e) });

    expect(error?.message).toContain('Dub API key');
  });

  it('sends edit and delete to the Links page, not the shortener API', () => {
    // The paste edit key is per-paste; the shortener credential is per-account.
    // Bridging them would let any draft rewrite any link on the account.
    const { provider } = setup();
    let updateError: Error | undefined;
    let deleteError: Error | undefined;

    provider.update('abc123', '', INPUT).subscribe({ error: (e: Error) => (updateError = e) });
    provider.delete('abc123', '').subscribe({ error: (e: Error) => (deleteError = e) });

    expect(updateError?.message).toContain('Links page');
    expect(deleteError?.message).toContain('Links page');
  });

  it('surfaces a create failure rather than reporting a link that does not exist', () => {
    const { provider, registry } = setup();
    registry.create.mockReturnValueOnce(throwError(() => new Error('Dub rejected the request.')));
    let error: Error | undefined;

    provider.create(INPUT).subscribe({ error: (e: Error) => (error = e) });

    expect(error?.message).toBe('Dub rejected the request.');
  });
});
