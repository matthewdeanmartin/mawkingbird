import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Account } from '../../platform/api/models';
import { tallyComposition } from '../audience-composition';
import { estimateAudience } from '../effective-audience';
import { AudienceCompositionPanel } from './audience-composition-panel';

function account(acct: string): Account {
  return {
    id: acct,
    acct,
    url: 'https://home.example/@x',
    followers_count: 20,
    statuses_count: 10,
    bot: false,
  } as Account;
}

async function render(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({ imports: [AudienceCompositionPanel] });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(AudienceCompositionPanel);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('AudienceCompositionPanel', () => {
  const followers = tallyComposition([account('a'), account('b@far.example')]);

  it('shows the four breakdowns per side and asks for both lists before mutuals', async () => {
    const root = await render({
      composition: { followers, following: followers },
      results: {
        followers: estimateAudience({ ...emptyTally(), scanned: 2 }, 100),
        following: null,
      },
      overlap: null,
      homeHost: 'home.example',
    });
    expect(root.querySelectorAll('.side')).toHaveLength(3);
    expect(root.querySelectorAll('mb-bar-list')).toHaveLength(8);
    // Partial followers scan is labelled as a sample.
    expect(root.querySelectorAll('.side')[0].textContent).toContain('2');
    expect(root.querySelector('dl')).toBeNull();
  });

  it('shows mutual tiles when the overlap is known', async () => {
    const root = await render({
      composition: { followers, following: followers },
      results: {},
      overlap: { mutuals: 3, notFollowedBack: 1, notFollowingBack: 2 },
    });
    expect(root.querySelectorAll('dl dd')).toHaveLength(3);
  });
});

function emptyTally() {
  return { scanned: 0, active: 0, dormant: 0, lowCadence: 0, zombies: 0 };
}
