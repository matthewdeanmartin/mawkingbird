import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Drafts } from '../../../../drafts';
import { encodeBase64 } from '../../../../providers/hugo/hugo-contents';
import { HugoEditSession } from '../../../../providers/hugo/hugo-edit-session';
import { HugoRepo, HugoSettings } from '../../../../providers/hugo/hugo-settings';
import { ConnectionHugo } from './connection-hugo';

const REPO: HugoRepo = {
  owner: 'mistersql',
  repo: 'my-blog',
  branch: 'main',
  contentPath: 'content/posts',
  siteUrl: null,
  includeInProfile: false,
};

const POST = [
  '+++',
  'title = "Hello World"',
  'date = 2020-03-04T05:06:07Z',
  'draft = false',
  'weight = 5',
  'categories = ["dev"]',
  '+++',
  '',
  'The body, as written.',
  '',
].join('\n');

function dirEntry(name: string, sha = `sha-${name}`) {
  return { name, path: `content/posts/${name}`, sha, size: 10, type: 'file' as const };
}

/** Directory listing plus one readable post file. */
function routeGitHub(fileSha = 'fresh-sha', text = POST): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.startsWith('https://api.github.com/')) {
      return Promise.resolve(new Response('{}', { status: 200 }));
    }
    if (url.includes('/contents/content/posts/hello-world.md')) {
      return Promise.resolve(
        new Response(JSON.stringify({ content: encodeBase64(text), sha: fileSha }), {
          status: 200,
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify([dirEntry('hello-world.md', 'stale-sha')]), { status: 200 }),
    );
  });
}

describe('ConnectionHugo (posts)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  async function setUp(): Promise<ComponentFixture<ConnectionHugo>> {
    TestBed.inject(HugoSettings).connect('tok', REPO);
    const fixture = TestBed.createComponent(ConnectionHugo);
    fixture.detectChanges();
    // The list loads asynchronously on init.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    return fixture;
  }

  function rowText(fixture: ComponentFixture<ConnectionHugo>): string[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('.hugo-post')].map(
      (row) => row.textContent ?? '',
    );
  }

  it('lists the repository posts with their real titles', async () => {
    routeGitHub();
    const fixture = await setUp();

    expect(rowText(fixture)).toHaveLength(1);
    expect(rowText(fixture)[0]).toContain('Hello World');
  });

  it('parks both handoffs and navigates to the composer on edit', async () => {
    routeGitHub();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = await setUp();

    const component = fixture.componentInstance as unknown as {
      edit(row: { path: string; title: string }): Promise<void>;
    };
    await component.edit({ path: 'content/posts/hello-world.md', title: 'Hello World' });

    // The git half, which a DraftSnapshot has no place for.
    const edit = TestBed.inject(HugoEditSession).current();
    expect(edit).toMatchObject({
      path: 'content/posts/hello-world.md',
      // Re-read, so it is the file's current sha and not the list's stale one.
      sha: 'fresh-sha',
      format: 'toml',
      date: '2020-03-04T05:06:07Z',
      originalTitle: 'Hello World',
    });
    // Unmodelled keys ride along so the edit can put them back.
    expect(edit?.extraLines).toEqual(['weight = 5', 'categories = ["dev"]']);

    // The text half, in the slot the composer already drains on seed.
    const handoff = TestBed.inject(Drafts).takeHandoff();
    expect(handoff?.snapshot).toMatchObject({
      segments: ['The body, as written.'],
      spoilerText: 'Hello World',
      target: 'hugo',
    });

    expect(navigate).toHaveBeenCalledWith(['/home']);
  });

  it('reports a failed open without parking a half-built edit', async () => {
    routeGitHub();
    const fixture = await setUp();
    // The file vanishes between listing it and opening it.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }),
    );

    const component = fixture.componentInstance as unknown as {
      edit(row: { path: string; title: string }): Promise<void>;
      openError(): string | null;
    };
    await component.edit({ path: 'content/posts/hello-world.md', title: 'Hello World' });

    expect(component.openError()).toContain('cannot find');
    expect(TestBed.inject(HugoEditSession).editing()).toBe(false);
  });

  it('clears the list on disconnect', async () => {
    routeGitHub();
    const fixture = await setUp();

    (fixture.componentInstance as unknown as { disconnect(): void }).disconnect();
    fixture.detectChanges();

    expect(rowText(fixture)).toHaveLength(0);
  });
});
