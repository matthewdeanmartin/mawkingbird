import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { pasteDraftItem, toSnapshot } from '../../pages/drafts/draft-items';
import { GistProvider, gistFilename } from './gist-provider';
import { GistSettings } from './gist-settings';
import { PasteHistory } from './paste-history';
import { PasteCreated, PasteRecentItem } from './paste-provider';
import { PasteProviderRegistry } from './paste-provider-registry';

const GISTS_URL = 'https://api.github.com/gists';

describe('gistFilename', () => {
  it('turns the title into a slug with the language extension', () => {
    // GitHub infers highlighting from the extension, so the language picker has
    // to become a filename — there is no separate language field to set.
    expect(gistFilename('A Title', 'markdown')).toBe('a-title.md');
    expect(gistFilename('notes', 'python')).toBe('notes.py');
  });

  it('falls back to a name when there is no title', () => {
    expect(gistFilename('', 'plaintext')).toBe('paste.txt');
    expect(gistFilename('   ', 'json')).toBe('paste.json');
  });

  it('handles punctuation and unicode without producing junk', () => {
    expect(gistFilename('Hello, World! (draft)', 'markdown')).toBe('hello-world-draft.md');
    expect(gistFilename('日本語', 'markdown')).toBe('日本語.md');
  });

  it('falls back to .txt for a language it has no extension for', () => {
    expect(gistFilename('x', 'klingon')).toBe('x.txt');
  });

  it('keeps the name short enough to be a filename', () => {
    expect(gistFilename('a'.repeat(200), 'markdown').length).toBeLessThanOrEqual(64);
  });
});

describe('GistProvider', () => {
  let http: HttpTestingController;
  let provider: GistProvider;
  let settings: GistSettings;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    provider = TestBed.inject(GistProvider);
    settings = TestBed.inject(GistSettings);
  });

  function connect(): void {
    settings.connect('gist-token', { login: 'mistersql' });
  }

  // ------------------------------------------------------------- availability

  it('is unavailable until a token is stored', () => {
    // Offering it with nothing connected would be an option that can only fail.
    expect(provider.available()).toBe(false);
    connect();
    expect(provider.available()).toBe(true);
  });

  it('names itself after the connected account', () => {
    expect(provider.label).toBe('GitHub Gist');
    connect();
    expect(provider.label).toBe('GitHub Gist (@mistersql)');
  });

  it('joins the registry only once connected', () => {
    const registry = TestBed.inject(PasteProviderRegistry);
    expect(registry.available().some((p) => p.id === 'gist')).toBe(false);

    connect();
    expect(registry.available().some((p) => p.id === 'gist')).toBe(true);
    // Always resolvable by id, connected or not — a history entry created
    // through it must stay readable after a disconnect.
    expect(registry.get('gist')).toBeTruthy();
  });

  it('refuses to create anything without a token, and issues no request', () => {
    let message = '';
    provider
      .create({
        title: 't',
        content: 'c',
        language: 'markdown',
        expiry: 'never',
        visibility: 'unlisted',
      })
      .subscribe({ error: (e: Error) => (message = e.message) });

    http.verify();
    expect(message).toContain('No GitHub token');
  });

  // -------------------------------------------------------------------- create

  it('creates a secret gist for an unlisted paste', () => {
    connect();
    let created: PasteCreated | undefined;
    provider
      .create({
        title: 'A title',
        content: 'the body',
        language: 'markdown',
        expiry: 'never',
        visibility: 'unlisted',
      })
      .subscribe((result) => (created = result));

    const request = http.expectOne(GISTS_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer gist-token');
    // "unlisted" is GitHub's secret gist: not listed, but readable by link.
    expect(request.request.body.public).toBe(false);
    expect(request.request.body.description).toBe('A title');
    expect(request.request.body.files['a-title.md'].content).toBe('the body');

    request.flush({
      id: 'abc123',
      html_url: 'https://gist.github.com/mistersql/abc123',
      files: { 'a-title.md': { raw_url: 'https://gist.githubusercontent.com/raw/abc123' } },
    });

    expect(created).toEqual({
      slug: 'abc123',
      url: 'https://gist.github.com/mistersql/abc123',
      rawUrl: 'https://gist.githubusercontent.com/raw/abc123',
      // No per-paste secret: the account token is the authority.
      editKey: '',
    });
  });

  it('creates a public gist for a public paste', () => {
    connect();
    provider
      .create({
        title: 't',
        content: 'c',
        language: 'markdown',
        expiry: 'never',
        visibility: 'public',
      })
      .subscribe();

    expect(http.expectOne(GISTS_URL).request.body.public).toBe(true);
  });

  it('errors rather than inventing a slug when GitHub returns no id', () => {
    connect();
    let failed = false;
    provider
      .create({
        title: 't',
        content: 'c',
        language: 'markdown',
        expiry: 'never',
        visibility: 'unlisted',
      })
      .subscribe({ error: () => (failed = true) });

    http.expectOne(GISTS_URL).flush({ html_url: 'https://gist.github.com/x' });
    expect(failed).toBe(true);
  });

  it('offers no expiry but "never", because gists do not expire', () => {
    // Claiming a TTL GitHub does not implement would be a promise this
    // provider cannot keep.
    expect(provider.expiries.map((e) => e.value)).toEqual(['never']);
  });

  // -------------------------------------------------------------------- update

  it('updates by patching the gist under the account token', () => {
    connect();
    provider
      .update('abc123', '', { title: 'New title', content: 'new body', language: 'markdown' })
      .subscribe();

    const request = http.expectOne(`${GISTS_URL}/abc123`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body.description).toBe('New title');
    expect(request.request.body.files['new-title.md'].content).toBe('new body');
    request.flush({ id: 'abc123' });
  });

  it('deletes by id', () => {
    connect();
    provider.delete('abc123', '').subscribe();

    const request = http.expectOne(`${GISTS_URL}/abc123`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });

  // -------------------------------------------------------------------- recent

  it('lists single-file gists and skips multi-file ones', () => {
    // A multi-file gist is a project, not a note — and editing one here would
    // rewrite it down to a single file.
    connect();
    let items: PasteRecentItem[] = [];
    provider.recent().subscribe((result) => (items = result));

    http.expectOne(`${GISTS_URL}?per_page=30`).flush([
      {
        id: 'one',
        description: 'A note',
        created_at: '2026-08-01T00:00:00Z',
        html_url: 'https://gist.github.com/one',
        files: { 'a-note.md': { filename: 'a-note.md' } },
      },
      {
        id: 'many',
        description: 'A project',
        files: { 'a.py': { filename: 'a.py' }, 'b.py': { filename: 'b.py' } },
      },
    ]);

    expect(items.map((i) => i.slug)).toEqual(['one']);
    expect(items[0].title).toBe('A note');
    expect(items[0].language).toBe('markdown');
  });

  it('falls back to the filename when a gist has no description', () => {
    connect();
    let items: PasteRecentItem[] = [];
    provider.recent().subscribe((result) => (items = result));

    http
      .expectOne(`${GISTS_URL}?per_page=30`)
      .flush([{ id: 'x', files: { 'notes.txt': { filename: 'notes.txt' } } }]);

    expect(items[0].title).toBe('notes.txt');
    expect(items[0].language).toBe('plaintext');
  });

  // -------------------------------------------------------------------- status

  it('renders a status with the title escaped', () => {
    connect();
    const status = provider.status({
      slug: 'x',
      title: '<script>alert(1)</script>',
      language: 'markdown',
      preview: 'notes.md',
      createdAt: '2026-08-01T00:00:00Z',
      url: 'https://gist.github.com/x',
      rawUrl: 'https://gist.github.com/x/raw',
    });

    expect(status.content).not.toContain('<script>');
    expect(status.content).toContain('&lt;script&gt;');
    expect(status.providerRef).toEqual({ providerId: 'gist', slug: 'x' });
  });

  // --------------------------------------------------------------------- auth

  it('whoami does not require a stored token, so a bad one is never saved', () => {
    let login = '';
    provider.whoami('unsaved-token').subscribe((user) => (login = user.login));

    const request = http.expectOne('https://api.github.com/user');
    expect(request.request.headers.get('Authorization')).toBe('Bearer unsaved-token');
    request.flush({ login: 'mistersql' });

    expect(login).toBe('mistersql');
    expect(settings.connected()).toBe(false);
  });

  // ------------------------------------------------------ the point of all this

  it('a created gist becomes a draft, with no drafts-side code at all', () => {
    // This is why Gist is modelled as a paste provider rather than as a fifth
    // draft kind: every paste service is already a draft source, so the gist
    // lands in /drafts and in the writing workspace for free.
    connect();
    const input = {
      title: 'Half an essay',
      content: 'the body so far',
      language: 'markdown' as const,
      expiry: 'never' as const,
      visibility: 'unlisted' as const,
    };
    provider.create(input).subscribe((created) => {
      TestBed.inject(PasteHistory).add('gist', provider.label, input, created);
    });

    http.expectOne(GISTS_URL).flush({
      id: 'abc123',
      html_url: 'https://gist.github.com/mistersql/abc123',
      files: { 'half-an-essay.md': { raw_url: 'https://gist.github.com/raw' } },
    });

    const items = TestBed.inject(PasteHistory).records().map(pasteDraftItem);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('paste');
    expect(items[0].key).toBe('paste:abc123');
    expect(items[0].preview).toBe('Half an essay');
    expect(items[0].badges).toContain('📋 GitHub Gist (@mistersql)');

    // And it reads back into the editor as ordinary text.
    expect(toSnapshot(items[0].source, 'public').segments).toEqual(['the body so far']);
  });
});
