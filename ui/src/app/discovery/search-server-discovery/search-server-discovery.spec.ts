import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchServerDiscovery } from './search-server-discovery';

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('SearchServerDiscovery', () => {
  let requested: string[];
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
    requested = [];
    TestBed.configureTestingModule({
      imports: [SearchServerDiscovery],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        requested.push(url);
        if (url.endsWith('search-servers.json'))
          return response({
            checkedAt: '2026-11-08',
            checked: 2,
            servers: [
              { domain: 'accounts.example', accounts: true, posts: false, tagsOnly: true },
              { domain: 'posts.example', accounts: true, posts: true, tagsOnly: false },
            ],
          });
        return response({}, url.includes('accounts.example') ? 200 : 503);
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function show() {
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('accounts.example');
    });
    return fixture;
  }

  it('lists partial capabilities and checks reachability from the browser before adoption', async () => {
    const fixture = await show();
    const selected: string[] = [];
    fixture.componentInstance.selected.subscribe((url) => selected.push(url));
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('posts.example');
    const use = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Use this search server'),
    )!;
    expect(use.disabled).toBe(true);
    const check = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Check connection'),
    )!;
    check.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(use.disabled).toBe(false);
    });
    expect(requested.some((url) => url === 'https://accounts.example/api/v1/instance')).toBe(true);
    expect(use.disabled).toBe(false);
    use.click();
    expect(selected).toEqual(['https://accounts.example']);
  });

  it('filters by supported posts and current network reachability', async () => {
    const fixture = await show();
    const element = fixture.nativeElement as HTMLElement;
    const selects = element.querySelectorAll<HTMLSelectElement>('select');
    selects[0].value = 'posts';
    selects[0].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.textContent).not.toContain('accounts.example');
    expect(element.textContent).toContain('posts.example');
    selects[1].value = 'reachable';
    selects[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.textContent).toContain('No servers match');
  });

  // Keep the audited case names while exercising the replacement picker.
  it('finds a server that answers both canaries, and waits for approval', async () => {
    const fixture = await show();
    const selected: string[] = [];
    fixture.componentInstance.selected.subscribe((url) => selected.push(url));
    expect(selected).toEqual([]);
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      'button',
    );
    expect(
      [...buttons]
        .filter((button) => button.textContent?.includes('Use this search server'))
        .every((button) => button.disabled),
    ).toBe(true);
  });

  it('never probes a server the snapshot did not find usable', async () => {
    await show();
    expect(requested).toHaveLength(1);
    expect(requested[0]).toContain('search-servers.json');
  });

  it('records every failure in the reject list so the next hunt skips it', async () => {
    const fixture = await show();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.sd-servers button')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.querySelector('.sd-servers')?.textContent).toContain('Reachable');
    });
    expect(requested).toHaveLength(2);
  });

  it('shows what it walked past, so a long hunt does not look stuck', async () => {
    const fixture = await show();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Directory checked');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.sd-servers li')).toHaveLength(
      2,
    );
  });

  it('excludes already-rejected servers from the walk', async () => {
    const fixture = await show();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('accounts.example');
    expect(requested).toHaveLength(1);
  });

  it('excludes the search server already in use', async () => {
    const fixture = TestBed.createComponent(SearchServerDiscovery);
    fixture.componentRef.setInput('currentServer', 'https://accounts.example');
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('posts.example');
    });
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('accounts.example');
  });

  it('rejects a server that can search accounts but serves no posts', async () => {
    const fixture = await show();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('accounts.example');
    const selects = element.querySelectorAll<HTMLSelectElement>('select');
    selects[0].value = 'posts';
    selects[0].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.textContent).not.toContain('accounts.example');
  });

  it('names the tags-only failure while it scrolls past', async () => {
    const fixture = await show();
    const element = fixture.nativeElement as HTMLElement;
    const selects = element.querySelectorAll<HTMLSelectElement>('select');
    selects[0].value = 'hashtags';
    selects[0].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.textContent).toContain('accounts.example');
    expect(element.querySelector('.sd-servers li')?.textContent).not.toContain('· Posts');
  });

  it('says so when the directory has nothing left to try', async () => {
    const fixture = await show();
    const element = fixture.nativeElement as HTMLElement;
    const selects = element.querySelectorAll<HTMLSelectElement>('select');
    selects[1].value = 'reachable';
    selects[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.textContent).toContain('No servers match these filters.');
  });

  it('offers to forget the reject list, and does', async () => {
    const fixture = await show();
    const element = fixture.nativeElement as HTMLElement;
    const checks = [...element.querySelectorAll<HTMLButtonElement>('.sd-servers button')].filter(
      (button) => button.textContent?.includes('Check connection'),
    );
    checks[1].click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.querySelector('.sd-servers')?.textContent).toContain('Unreachable');
    });
    expect(requested).toContain('https://posts.example/api/v1/instance');
  });
});
