import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Status } from '../../platform/api/models';
import { computeDecay } from '../interaction-decay';
import { InteractionDecayScan } from '../interaction-decay-scan';
import { InteractionDecayPanel } from './interaction-decay-panel';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function oldPost(id: string, ageDays: number): Status {
  return {
    id,
    created_at: new Date(Date.now() - ageDays * DAY).toISOString(),
    reblog: null,
    in_reply_to_id: null,
    favourites_count: 2,
    reblogs_count: 1,
    replies_count: 0,
  } as Status;
}

async function render(posts: Status[]) {
  TestBed.configureTestingModule({
    imports: [InteractionDecayPanel],
    providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(InteractionDecayPanel);
  fixture.componentRef.setInput('accountId', 'me');
  fixture.componentRef.setInput('posts', posts);
  fixture.detectChanges();
  return fixture;
}

describe('InteractionDecayPanel', () => {
  it('asks before reading, and explains when no post is old enough', async () => {
    const young = await render([oldPost('y', 1)]);
    expect(young.nativeElement.querySelector('button')).toBeNull();
    TestBed.resetTestingModule();
    const ready = await render([oldPost('a', 8)]);
    expect(ready.nativeElement.querySelector('button')).not.toBeNull();
    expect(ready.nativeElement.querySelector('svg')).toBeNull();
  });

  it('draws one line per series with data, the table and a hover tooltip', async () => {
    const fixture = await render([oldPost('a', 8)]);
    const created = Date.now() - 8 * DAY;
    const result = computeDecay(
      [{ id: 'a', createdAt: created, counters: 3 }],
      [
        { kind: 'likes', postId: 'a', at: created + HOUR },
        { kind: 'likes', postId: 'a', at: created + 5 * HOUR },
        { kind: 'boosts', postId: 'a', at: created + 2 * HOUR },
      ],
    );
    TestBed.inject(InteractionDecayScan).state.set({
      phase: 'done',
      accountId: 'me',
      pages: 1,
      read: 3,
      matched: 3,
      reachedBack: created - DAY,
      oldestPost: created,
      stop: 'reachedOldest',
      result,
      excluded: 0,
    });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    // likes, boosts and all; replies has no data and draws nothing.
    expect(root.querySelectorAll('path.line')).toHaveLength(3);
    expect(root.querySelectorAll('.decay-table tbody tr')).toHaveLength(13);
    expect(root.querySelector('.tooltip')).toBeNull();
    root.querySelectorAll('rect.hit')[3].dispatchEvent(new Event('pointerenter'));
    fixture.detectChanges();
    expect(root.querySelector('.tooltip')).not.toBeNull();
    expect(root.querySelectorAll('circle.dot')).toHaveLength(3);
  });

  it('ignores a run that belongs to another account', async () => {
    const fixture = await render([oldPost('a', 8)]);
    TestBed.inject(InteractionDecayScan).state.set({
      phase: 'scanning',
      accountId: 'someone-else',
      pages: 0,
      read: 0,
      matched: 0,
      reachedBack: null,
      oldestPost: 0,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mb-progress')).toBeNull();
  });
});
