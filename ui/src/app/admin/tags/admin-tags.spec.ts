import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AdminApi, AdminTag } from '../admin-api';
import { AdminTags } from './admin-tags';

function tag(overrides: Partial<AdminTag> = {}): AdminTag {
  return {
    id: '1',
    name: 'birds',
    url: '',
    usable: true,
    trendable: false,
    listable: true,
    requires_review: true,
    ...overrides,
  };
}

describe('AdminTags', () => {
  function setUp(api: Partial<AdminApi>) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminApi, useValue: api }],
    });
    const fixture = TestBed.createComponent(AdminTags);
    fixture.detectChanges();
    return fixture;
  }

  it('lists hashtags with their three switches and flags ones needing review', () => {
    const fixture = setUp({ tags: () => of([tag()]) });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('#birds');
    expect(el.textContent).toContain('Needs review');
    const boxes = [...el.querySelectorAll<HTMLInputElement>('mb-checkbox input')];
    expect(boxes.map((b) => b.checked)).toEqual([true, false, true]);
  });

  it('saves one switch and puts it back when the server refuses', () => {
    const updateTag = vi
      .fn()
      .mockReturnValueOnce(of(tag({ trendable: true })))
      .mockReturnValueOnce(throwError(() => new Error('403')));
    const fixture = setUp({ tags: () => of([tag()]), updateTag });
    const ui = fixture.componentInstance as unknown as {
      set(t: AdminTag, key: string, value: boolean): void;
      tags(): AdminTag[];
    };

    ui.set(ui.tags()[0], 'trendable', true);
    expect(updateTag).toHaveBeenCalledWith('1', { trendable: true });
    expect(ui.tags()[0].trendable).toBe(true);

    ui.set(ui.tags()[0], 'usable', false);
    expect(ui.tags()[0].usable).toBe(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Not saved');
  });
});
