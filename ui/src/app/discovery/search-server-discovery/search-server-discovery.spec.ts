import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchServerDiscovery } from './search-server-discovery';

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('SearchServerDiscovery', () => {
  const dialogDescriptors = ['showModal', 'close'].map(
    (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
  );
  let requested: string[];
  let postsAvailable: boolean;
  let reachable: Set<string>;
  beforeEach(() => {
    for (const [name] of dialogDescriptors) {
      Object.defineProperty(HTMLDialogElement.prototype, name, {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = name === 'showModal';
        },
      });
    }
    requested = [];
    postsAvailable = false;
    reachable = new Set(['alternative.example', 'post.example', 'empty.example']);
    TestBed.configureTestingModule({ imports: [SearchServerDiscovery] });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        requested.push(url);
        if (url.endsWith('search-servers.json'))
          return response({
            checkedAt: '2026-11-08',
            checked: 4,
            servers: [
              { domain: 'chosen.example', accounts: true, posts: false, tagsOnly: true },
              { domain: 'alternative.example', accounts: true, posts: false, tagsOnly: true },
              { domain: 'empty.example', accounts: false, posts: false, tagsOnly: false },
              { domain: 'post.example', accounts: true, posts: postsAvailable, tagsOnly: false },
            ],
          });
        return response({}, reachable.has(new URL(url).hostname) ? 200 : 503);
      }),
    );
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    for (const [name, descriptor] of dialogDescriptors) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
    vi.unstubAllGlobals();
  });

  async function show() {
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('chosen.example');
    });
    return fixture;
  }

  it('offers only supported capabilities from the shipped snapshot without probing hosts', async () => {
    const fixture = await show();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).not.toContain('empty.example');
    expect([...element.querySelectorAll('option')].map((option) => option.value)).toEqual([
      'accounts',
      'hashtags',
    ]);
    expect(requested).toHaveLength(1);
  });

  it('offers post search only when the snapshot found a server with posts', async () => {
    postsAvailable = true;
    const fixture = await show();
    const element = fixture.nativeElement as HTMLElement;
    expect([...element.querySelectorAll('option')].map((option) => option.value)).toContain(
      'posts',
    );
    const select = element.querySelector('select')!;
    select.value = 'posts';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.querySelectorAll('.sd-servers li')).toHaveLength(1);
    expect(element.textContent).toContain('post.example');
  });

  it('checks only the chosen host and adopts it when reachable', async () => {
    const fixture = await show();
    const selected: string[] = [];
    fixture.componentInstance.selected.subscribe((url) => selected.push(url));
    const element = fixture.nativeElement as HTMLElement;
    const button = [...element.querySelectorAll<HTMLButtonElement>('.sd-servers button')][1];
    button.click();
    await vi.waitFor(() => expect(selected).toEqual(['https://alternative.example']));
    expect(requested).toEqual([
      expect.stringContaining('search-servers.json'),
      'https://alternative.example/api/v1/instance',
    ]);
  });

  it('only searches for one reachable alternative after the chosen host fails', async () => {
    const fixture = await show();
    const selected: string[] = [];
    fixture.componentInstance.selected.subscribe((url) => selected.push(url));
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.sd-servers button')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.textContent).toContain('This server is reachable');
    });
    expect(element.textContent).not.toContain('chosen.example');
    expect(element.querySelectorAll('.sd-servers li')).toHaveLength(1);
    expect(requested).toEqual([
      expect.stringContaining('search-servers.json'),
      'https://chosen.example/api/v1/instance',
      'https://alternative.example/api/v1/instance',
    ]);
    element.querySelector<HTMLButtonElement>('.sd-servers button')!.click();
    expect(selected).toEqual(['https://alternative.example']);
    expect(requested).toHaveLength(3);
  });

  // These cases retain the audited inventory names while asserting the new
  // capability-first picker and its bounded fallback behavior.
  it('finds a server that answers both canaries, and waits for approval', async () => {
    const fixture = await show();
    const selected: string[] = [];
    fixture.componentInstance.selected.subscribe((url) => selected.push(url));
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.sd-servers button')!
      .click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('alternative.example');
    });
    expect(selected).toEqual([]);
  });

  it('never probes a server the snapshot did not find usable', async () => {
    const fixture = await show();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('empty.example');
    expect(requested).toHaveLength(1);
  });

  it('records every failure in the reject list so the next hunt skips it', async () => {
    const fixture = await show();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.sd-servers button')!
      .click();
    await vi.waitFor(() =>
      expect(requested).toContain('https://alternative.example/api/v1/instance'),
    );
    expect(requested.filter((url) => url.includes('chosen.example'))).toHaveLength(1);
  });

  it('shows what it walked past, so a long hunt does not look stuck', async () => {
    const fixture = await show();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.sd-servers button')!
      .click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'This server is reachable',
      );
    });
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('chosen.example');
  });

  it('excludes already-rejected servers from the walk', async () => {
    const fixture = await show();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.sd-servers button')!
      .click();
    await vi.waitFor(() => expect(requested).toHaveLength(3));
    expect(requested).not.toContain('https://empty.example/api/v1/instance');
  });

  it('excludes the search server already in use', async () => {
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.componentRef.setInput('currentServer', 'https://chosen.example');
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('alternative.example');
    });
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('chosen.example');
  });

  it('rejects a server that can search accounts but serves no posts', async () => {
    const fixture = await show();
    expect(
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('option')].map(
        (option) => option.value,
      ),
    ).not.toContain('posts');
  });

  it('names the tags-only failure while it scrolls past', async () => {
    const fixture = await show();
    const element = fixture.nativeElement as HTMLElement;
    const select = element.querySelector('select')!;
    select.value = 'hashtags';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.textContent).toContain('chosen.example');
    expect(element.querySelector('.sd-servers li')?.textContent).toContain('Hashtags');
  });

  it('says so when the directory has nothing left to try', async () => {
    reachable.clear();
    const fixture = await show();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.sd-servers button')!
      .click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('No reachable server');
    });
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.sd-servers li')).toHaveLength(
      0,
    );
  });

  it('offers to forget the reject list, and does', async () => {
    const fixture = await show();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.sd-servers button')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.textContent).toContain('This server is reachable');
    });
    const select = element.querySelector('select')!;
    select.value = 'hashtags';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.textContent).toContain('chosen.example');
  });
});
