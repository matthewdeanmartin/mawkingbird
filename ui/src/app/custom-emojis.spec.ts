import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CustomEmojis } from './custom-emojis';
import { Server } from './server';

describe('CustomEmojis', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads lazily, retains non-picker emoji for preview and reloads on server change', () => {
    const service = TestBed.inject(CustomEmojis);
    TestBed.tick();
    http.expectNone('/api/v1/custom_emojis');
    service.ensureLoaded();
    http.expectOne('/api/v1/custom_emojis').flush([{ shortcode: 'one', visible_in_picker: false }]);
    expect(service.emojis()[0].shortcode).toBe('one');
    service.ensureLoaded();
    http.expectNone('/api/v1/custom_emojis');
    TestBed.inject(Server).setBaseUrl('https://other.example');
    TestBed.tick();
    expect(service.emojis()).toEqual([]);
    http.expectOne('/api/v1/custom_emojis').flush([{ shortcode: 'two' }]);
    expect(service.emojis()[0].shortcode).toBe('two');
  });

  it('cancels old server requests and never replaces the new server’s emoji with them', () => {
    const service = TestBed.inject(CustomEmojis);
    service.ensureLoaded();
    const old = http.expectOne('/api/v1/custom_emojis');
    TestBed.inject(Server).setBaseUrl('https://other.example');
    TestBed.tick();
    expect(old.cancelled).toBe(true);
    http.expectOne('/api/v1/custom_emojis').flush([]);
    expect(service.emojis()).toEqual([]);
  });
});
