import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MastodonNotification, Status } from '../../platform/api/models';
import { EngagedAccumulator } from '../engaged-audience';
import { InteractionDecayScan } from '../interaction-decay-scan';
import { EngagedAudiencePanel } from './engaged-audience-panel';

async function render() {
  TestBed.configureTestingModule({
    imports: [EngagedAudiencePanel],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(EngagedAudiencePanel);
  fixture.componentRef.setInput('accountId', 'me');
  fixture.componentRef.setInput('posts', [
    { id: 'p', created_at: new Date(2026, 10, 24, 9).toISOString() } as Status,
  ]);
  fixture.detectChanges();
  return fixture;
}

describe('EngagedAudiencePanel', () => {
  it('offers the shared read before anything has run', async () => {
    const fixture = await render();
    expect(fixture.nativeElement.querySelector('button')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.week')).toBeNull();
  });

  it('draws the two week grids, busiest times and weekday bars', async () => {
    const fixture = await render();
    const acc = new EngagedAccumulator();
    for (const person of ['a', 'b', 'c']) {
      acc.add({
        id: person,
        type: 'favourite',
        created_at: new Date(2026, 10, 24, 9, 15).toISOString(),
        account: { id: person, note: '' },
      } as MastodonNotification);
    }
    TestBed.inject(InteractionDecayScan).state.set({
      phase: 'done',
      accountId: 'me',
      pages: 1,
      read: 3,
      matched: 0,
      reachedBack: new Date(2026, 10, 1).getTime(),
      oldestPost: 0,
      stop: 'serverEnd',
      engaged: acc.summary(),
    });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const grids = root.querySelectorAll('.week');
    expect(grids).toHaveLength(2);
    expect(grids[0].querySelectorAll('.cell')).toHaveLength(7 * 24);
    expect(grids[0].querySelectorAll('.cell[data-level="4"]')).toHaveLength(1);
    // Your post at the same hour shows in the second grid.
    expect(grids[1].querySelectorAll('.cell[data-level="4"]')).toHaveLength(1);
    expect(root.querySelectorAll('.best li')).toHaveLength(1);
    expect(root.querySelectorAll('mb-bar-list').length).toBeGreaterThanOrEqual(1);
  });
});
