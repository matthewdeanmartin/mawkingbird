import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyAccountPrefs } from '../../connections/bluesky/bluesky-account-prefs';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { SettingsBlueskyPreferences } from './settings-bluesky-preferences';

describe('Settings → Bluesky preferences', () => {
  let account: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    account = {
      load: vi.fn(async () => ({
        interests: ['art'],
        hiddenFromRecommendations: false,
        bot: false,
      })),
      setHomeFeed: vi.fn(async () => undefined),
      setInterests: vi.fn(async () => undefined),
      setBot: vi.fn(async () => {
        throw new Error('Bluesky said no');
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BlueskyAccountPrefs, useValue: account },
        {
          provide: BlueskySession,
          useValue: { linked: () => true, session: () => ({ did: 'did:plc:me' }) },
        },
      ],
    });
  });

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(SettingsBlueskyPreferences);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const checkbox = (el: HTMLElement, label: string) =>
    [...el.querySelectorAll('mb-checkbox')]
      .find((c) => c.textContent?.includes(label))!
      .querySelector('input') as HTMLInputElement;

  it('shows every section and the account’s interests', async () => {
    const el = await render();
    expect(el.textContent).toContain('Following feed');
    expect(el.textContent).toContain('Thread replies');
    expect(checkbox(el, 'Art').checked).toBe(true);
  });

  it('saves a Following-feed change over the current preferences', async () => {
    const el = await render();
    checkbox(el, 'Hide replies').click();
    await Promise.resolve();
    expect(account['setHomeFeed']).toHaveBeenCalledWith(
      expect.objectContaining({ hideReplies: true, hideRepliesByUnfollowed: true }),
    );
  });

  it('puts a refused privacy change back and says why', async () => {
    const fixture = TestBed.createComponent(SettingsBlueskyPreferences);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    checkbox(fixture.nativeElement, 'This account is automated').click();
    // The save is in flight: the box shows the new value, as in the browser.
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(checkbox(fixture.nativeElement, 'This account is automated').checked).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Bluesky said no');
  });
});
