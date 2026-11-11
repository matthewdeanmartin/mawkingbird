import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { TagActions } from './tag-actions';

describe('TagActions', () => {
  function render(inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Api, useValue: { tagChanges: new Subject() } },
        {
          provide: Auth,
          useValue: {
            isAnonymous: false,
            lacksMastodonToken: false,
            kind: signal('mastodon'),
            token: signal('t'),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(TagActions);
    fixture.componentRef.setInput('name', 'dogs');
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].map(
      (button) => button.textContent!.trim(),
    );
    return { fixture, labels };
  }

  it('offers Similar and Add only when the host asks for them, emitting the tag', () => {
    expect(render({}).labels).toEqual(['Follow', 'Feature', 'Add to bundle']);
    TestBed.resetTestingModule();

    const { fixture, labels } = render({ offerSimilar: true, offerAdd: true });
    expect(labels).toEqual(['Follow', 'Feature', 'Add to bundle', '+ Add', 'Similar']);
    const similar: string[] = [];
    const added: string[] = [];
    fixture.componentInstance.similar.subscribe((tag) => similar.push(tag));
    fixture.componentInstance.add.subscribe((tag) => added.push(tag));
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    buttons[3].click();
    buttons[4].click();
    expect(added).toEqual(['dogs']);
    expect(similar).toEqual(['dogs']);
    expect(buttons[4].title).toBe('Hashtags that often appear with #dogs');
  });
});
