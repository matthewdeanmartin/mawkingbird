import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../../platform/api/api';
import { ClientPrefs } from '../../../platform/storage/client-prefs';
import { Drafts } from '../../../publishing/drafts';
import { SetupState } from '../setup-state';
import { SetupIntro } from './setup-intro';

interface Page {
  text: { set(v: string): void };
  forcePublic: { set(v: boolean): void };
  phase(): string;
  post(): Promise<void>;
  pin(): Promise<void>;
  saveForLater(): void;
}

describe('setup intro', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let save: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    api = {
      postStatus: vi.fn(() => of({ id: 's1' })),
      pin: vi.fn(() => of({ id: 's1' })),
      verifyCredentials: vi.fn(() => of({})),
    };
    save = vi.fn(() => ({ ok: true }));
    TestBed.configureTestingModule({
      providers: [
        SetupState,
        { provide: Api, useValue: api },
        { provide: Drafts, useValue: { forCurrentAccount: () => ({ save }) } },
      ],
    });
  });

  function render(): { page: Page; el: HTMLElement } {
    const fixture = TestBed.createComponent(SetupIntro);
    fixture.detectChanges();
    return { page: fixture.componentInstance as unknown as Page, el: fixture.nativeElement };
  }

  it('starts blank with prompts that are not in the text', () => {
    const { el } = render();
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
    expect(el.textContent).toContain('What will you post about?');
  });

  it('posts their own words, then pins on request', async () => {
    const { page } = render();
    page.text.set('Hi! I draw birds. Based in Leeds. #birds');
    await page.post();
    expect(api['postStatus']).toHaveBeenCalledWith('Hi! I draw birds. Based in Leeds. #birds', {});
    expect(page.phase()).toBe('posted');
    await page.pin();
    expect(api['pin']).toHaveBeenCalledWith('s1');
    expect(page.phase()).toBe('pinned');
  });

  it('offers a public intro when posts default to followers only', async () => {
    TestBed.inject(ClientPrefs).setDefaultVisibility('private');
    const { page, el } = render();
    expect(el.textContent).toContain('Post this one publicly');
    page.forcePublic.set(true);
    page.text.set('hello');
    await page.post();
    expect(api['postStatus']).toHaveBeenCalledWith('hello', { visibility: 'public' });
  });

  it('saves to Drafts instead of posting while the account awaits approval', () => {
    TestBed.inject(SetupState).pending.set(true);
    const { page, el } = render();
    expect(el.textContent).toContain('Save for later');
    page.text.set('hello');
    page.saveForLater();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ segments: ['hello'] }));
    expect(api['postStatus']).not.toHaveBeenCalled();
  });
});
