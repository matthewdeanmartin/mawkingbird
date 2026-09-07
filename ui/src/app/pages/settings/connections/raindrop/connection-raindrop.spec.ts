import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { RaindropSession } from '../../../../providers/raindrop/raindrop-session';
import { ConnectionRaindrop } from './connection-raindrop';

/** Expose the protected signal — ngModel writes are async in specs. */
interface RaindropInternals {
  raindropToken: WritableSignal<string>;
}

describe('ConnectionRaindrop', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('connects Raindrop.io with a browser-compatible Test token', () => {
    const fixture: ComponentFixture<ConnectionRaindrop> =
      TestBed.createComponent(ConnectionRaindrop);
    fixture.detectChanges();

    (fixture.componentInstance as unknown as RaindropInternals).raindropToken.set('test-token');
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLFormElement>('form.raindrop-form')!
      .dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(TestBed.inject(RaindropSession).connected()).toBe(true);
    expect(localStorage.getItem('mockingbird_raindrop_token')).toContain('test-token');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Connected');
  });
});
