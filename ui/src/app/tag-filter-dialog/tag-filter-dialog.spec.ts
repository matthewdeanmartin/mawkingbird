import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TagFilterDialog } from './tag-filter-dialog';
import { Api } from '../api';
import { Auth } from '../auth';
import { Server } from '../server';

describe('Tag account-filter dialog', () => {
  let fixture: ComponentFixture<TagFilterDialog>;
  let api: { createFilter: ReturnType<typeof vi.fn> };
  let result: Subject<unknown>;
  let finish: ReturnType<typeof vi.fn>;
  const descriptors = ['showModal', 'close'].map(
    (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
  );
  beforeEach(() => {
    result = new Subject();
    api = { createFilter: vi.fn(() => result) };
    finish = vi.fn();
    for (const [name] of descriptors)
      Object.defineProperty(HTMLDialogElement.prototype, name, {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = name === 'showModal';
        },
      });
    TestBed.configureTestingModule({
      imports: [TagFilterDialog],
      providers: [
        { provide: Api, useValue: api },
        { provide: Auth, useValue: { kind: signal('mastodon'), token: signal('one') } },
        { provide: Server, useValue: { baseUrl: signal('https://social.test') } },
      ],
    });
    fixture = TestBed.createComponent(TagFilterDialog);
    fixture.componentRef.setInput('tag', 'Anime2000');
    fixture.componentRef.setInput('finish', finish);
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
    for (const [name, descriptor] of descriptors)
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  });
  it('does not create anything on opening or cancellation', () => {
    expect(api.createFilter).not.toHaveBeenCalled();
    const cancel = [...fixture.nativeElement.querySelectorAll('button')].find(
      (button) => (button as HTMLButtonElement).textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    cancel.click();
    expect(finish).toHaveBeenCalled();
    expect(api.createFilter).not.toHaveBeenCalled();
  });
  it('sends chosen context, expiry, action and whole-word matching only on confirmation', () => {
    const state = fixture.componentInstance as unknown as {
      contexts: ReturnType<typeof signal<string[]>>;
      expires: ReturnType<typeof signal<number>>;
      action: ReturnType<typeof signal<string>>;
      wholeWord: ReturnType<typeof signal<boolean>>;
      save(): void;
    };
    state.contexts.set(['home', 'public']);
    state.expires.set(3600);
    state.action.set('warn');
    state.wholeWord.set(false);
    state.save();
    state.save();
    expect(api.createFilter).toHaveBeenCalledOnce();
    expect(api.createFilter).toHaveBeenCalledWith({
      title: '#Anime2000',
      context: ['home', 'public'],
      filter_action: 'warn',
      expires_in: 3600,
      keywords_attributes: [{ keyword: '#Anime2000', whole_word: false }],
    });
    result.next({ id: 'created' });
    expect(finish).toHaveBeenCalledOnce();
  });
  it('preserves choices after an API failure for a deliberate retry', () => {
    const state = fixture.componentInstance as unknown as {
      save(): void;
      keyword(): string;
      saving(): boolean;
    };
    state.save();
    result.error(new Error('denied'));
    fixture.detectChanges();
    expect(state.saving()).toBe(false);
    expect(state.keyword()).toBe('#Anime2000');
    expect(finish).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
  });
});
