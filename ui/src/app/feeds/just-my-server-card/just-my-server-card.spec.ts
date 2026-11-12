import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { JustMyServer } from '../just-my-server';
import { JustMyServerCard } from './just-my-server-card';

function fakeJustMyServer() {
  return {
    enabled: signal(false),
    ready: signal(true),
    updating: signal(false),
    preparing: signal(false),
    checking: signal(false),
    error: signal(''),
    result: signal(null),
    homeHost: signal('home.example'),
    dialogOpen: signal(false),
    plan: signal({ addIds: ['a'], removeIds: [], alreadyPresent: 2 }),
    listTitle: signal('Home friends'),
    completed: signal(0),
    total: signal(1),
    progressLabel: signal('0 / 1'),
    requestEnabled: () => undefined,
    prepareUpdate: () => undefined,
    closeDialog: () => undefined,
    confirmUpdate: () => undefined,
  };
}

@Component({
  imports: [JustMyServerCard],
  template: `
    <app-just-my-server-card class="rail" />
    @if (page()) {
      <app-just-my-server-card class="page" />
    }
  `,
})
class TwoCards {
  readonly page = signal(true);
}

describe('JustMyServerCard', () => {
  it('opens one confirm dialog even when the rail and the page both show the card', () => {
    const fake = fakeJustMyServer();
    TestBed.configureTestingModule({ providers: [{ provide: JustMyServer, useValue: fake }] });
    const fixture = TestBed.createComponent(TwoCards);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.server-mode-card')).toHaveLength(2);

    fake.dialogOpen.set(true);
    fixture.detectChanges();
    expect(el.querySelectorAll('mb-dialog')).toHaveLength(1);
    // The newest card hosts it; when that one goes, the remaining card takes over.
    expect(el.querySelector('.page mb-dialog')).not.toBeNull();

    fixture.componentInstance.page.set(false);
    fixture.detectChanges();
    expect(el.querySelectorAll('mb-dialog')).toHaveLength(1);
    expect(el.querySelector('.rail mb-dialog')).not.toBeNull();
  });
});
