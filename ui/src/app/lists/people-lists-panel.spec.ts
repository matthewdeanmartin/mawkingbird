import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PeopleLists, PeopleListsJob } from './people-lists';
import { PeopleListsPanel } from './people-lists-panel';

describe('PeopleListsPanel', () => {
  let fixture: ComponentFixture<PeopleListsPanel>;
  let service: ReturnType<typeof fakeService>;
  function fakeService() {
    return {
      eligible: signal(true),
      running: signal(false),
      job: signal<PeopleListsJob | null>(null),
      lastSync: signal<number | null>(null),
      status: vi.fn(() => 'new'),
      start: vi.fn(async (_onlyAdd: boolean) => undefined),
      stop: vi.fn(),
    };
  }
  function button(text: string): HTMLButtonElement {
    return [
      ...(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>),
    ].find((element) => element.textContent?.trim() === text)!;
  }
  beforeEach(() => {
    service = fakeService();
    TestBed.configureTestingModule({
      imports: [PeopleListsPanel],
      providers: [{ provide: PeopleLists, useValue: service }],
    });
    fixture = TestBed.createComponent(PeopleListsPanel);
    fixture.detectChanges();
  });
  it('explains all categories before starting, with full sync as the default', () => {
    button('Generate lists of mutuals, etc.').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.querySelectorAll('li')).toHaveLength(11);
    expect(dialog.textContent).toContain('Only people you currently follow');
    expect(dialog.textContent).toContain('Older interactions may be missed');
    expect((dialog.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(
      false,
    );
    expect(service.start).not.toHaveBeenCalled();
    button('Generate / update lists').click();
    fixture.detectChanges();
    expect(service.start).toHaveBeenCalledWith(false);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });
  it('passes an explicit add-only selection and resets it when the dialog reopens', () => {
    button('Generate lists of mutuals, etc.').click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    button('Generate / update lists').click();
    fixture.detectChanges();
    expect(service.start).toHaveBeenCalledWith(true);
    button('Generate lists of mutuals, etc.').click();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement).checked,
    ).toBe(false);
  });
  it('shows missing-list recovery and refreshes the server rows when a run finishes', () => {
    const changed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);
    service.status.mockReturnValue('missing');
    fixture.componentRef.setInput('lists', []);
    service.running.set(true);
    service.job.set({
      phase: 'writing',
      step: 'lists',
      requests: 20,
      scanned: 3,
      completed: 4,
      added: 2,
      removed: 1,
      created: 1,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Update will recreate them');
    button('Stop').click();
    expect(service.stop).toHaveBeenCalledOnce();
    service.running.set(false);
    service.job.update((job) => ({ ...job!, phase: 'done' }));
    fixture.detectChanges();
    expect(changed).toHaveBeenCalledOnce();
    expect(button('Update people lists')).toBeDefined();
  });
  it('does not stop a job when navigating away and hides native actions for other account kinds', () => {
    service.eligible.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    fixture.destroy();
    expect(service.stop).not.toHaveBeenCalled();
  });
});
