import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClientPrefs } from '../../../client-prefs';
import { BlueControls } from './blue-controls';

describe('BlueControls terminology', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('offers every platform preset and the user-defined option', () => {
    const fixture = TestBed.createComponent(BlueControls);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Posts & boosts');
    expect(text).toContain('Tweets & retweets');
    expect(text).toContain('Florps & reflorps');
    expect(text).toContain('Skeets & reskeets');
    expect(text).toContain('Toots & boosts');
    expect(text).toContain('call them whatever you want');
  });

  it('shows all custom grammatical forms and updates the live preview', () => {
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setPostNoun('custom');
    prefs.setCustomTerminologyField('post', 'peep');
    prefs.setCustomTerminologyField('posts', 'peeps');
    prefs.setCustomTerminologyField('boosted', 'repeeped');

    const fixture = TestBed.createComponent(BlueControls);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelectorAll('.terminology-fields input')).toHaveLength(7);
    expect(el.querySelector('.terminology-preview')?.textContent).toContain('Peeps');
    expect(el.querySelector('.terminology-preview')?.textContent).toContain('Repeeped by Riley');
  });

  it('offers the complete shared reader font catalog', () => {
    const fixture = TestBed.createComponent(BlueControls);
    fixture.detectChanges();
    const labels = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLSelectElement>(
        'select[name="reader_font_family"] option',
      ),
    ].map((option) => option.textContent?.trim());

    expect(labels).toEqual([
      'Georgia',
      'Charter',
      'Palatino',
      'System Sans',
      'Helvetica Neue',
      'Inter',
      'Verdana',
      'Monospace',
    ]);
  });
});
