import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../api';
import { Account } from '../../models';
import { account } from '../../testing/forum-fixtures';
import { ForumListDialog } from './forum-list-dialog';

describe('ForumListDialog', () => {
  let api: {
    lists: ReturnType<typeof vi.fn>;
    relationships: ReturnType<typeof vi.fn>;
    createList: ReturnType<typeof vi.fn>;
    addManyToList: ReturnType<typeof vi.fn>;
  };
  let fixture: ComponentFixture<ForumListDialog>;
  const people: Account[] = ['a', 'b', 'c'].map((id) => account(id));
  // jsdom has no modal dialogs; stand in as the other dialog specs do.
  const descriptors = ['showModal', 'close'].map(
    (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
  );

  afterEach(() => {
    TestBed.resetTestingModule();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
  });

  beforeEach(() => {
    for (const [name] of descriptors) {
      Object.defineProperty(HTMLDialogElement.prototype, name, {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = name === 'showModal';
        },
      });
    }
    api = {
      lists: vi.fn(() => of([{ id: 'L1', title: 'Rustaceans' }])),
      relationships: vi.fn((ids: string[]) => of(ids.map((id) => ({ id, following: id !== 'c' })))),
      createList: vi.fn((title: string) => of({ id: 'L2', title })),
      addManyToList: vi.fn(() => of({})),
    };
    TestBed.configureTestingModule({
      imports: [ForumListDialog],
      providers: [{ provide: Api, useValue: api }],
    });
  });

  async function mount(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(ForumListDialog);
    fixture.componentRef.setInput('accounts', people);
    fixture.detectChanges();
    await vi.waitFor(() => expect(api.relationships).toHaveBeenCalled());
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function addButton(host: HTMLElement): HTMLButtonElement {
    return [...host.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Add 2 people'),
    ) as HTMLButtonElement;
  }

  it('says up front that only followed people can go in', async () => {
    const host = await mount();
    expect(host.textContent).toContain('2 of the 3 people here can be added');
    expect(addButton(host)).toBeTruthy();
  });

  it('adds the followed people to the chosen list and reports who was left out', async () => {
    const host = await mount();
    addButton(host).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.addManyToList).toHaveBeenCalledWith('L1', ['a', 'b']);
    expect(host.textContent).toContain('Added 2 to Rustaceans. 1 not followed were left out.');
  });

  it('falls back to one at a time when a batch is refused', async () => {
    api.addManyToList.mockImplementation((_list: string, ids: string[]) =>
      ids.length > 1 || ids[0] === 'a' ? throwError(() => ({ status: 422 })) : of({}),
    );
    const host = await mount();
    addButton(host).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.addManyToList).toHaveBeenCalledWith('L1', ['b']);
    expect(host.textContent).toContain('Added 1 to Rustaceans');
  });

  it('can make a new list for them', async () => {
    api.lists.mockReturnValue(of([]));
    const host = await mount();
    const title = host.querySelector<HTMLInputElement>('input[name="title"]')!;
    title.value = 'Thread people';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    addButton(host).click();
    await fixture.whenStable();
    expect(api.createList).toHaveBeenCalledWith('Thread people');
    expect(api.addManyToList).toHaveBeenCalledWith('L2', ['a', 'b']);
  });

  it('suggests following first when nobody here is followed', async () => {
    api.relationships.mockReturnValue(of([]));
    const host = await mount();
    expect(host.textContent).toContain('Try Follow everyone first');
    expect(addButton(host)).toBeUndefined();
  });
});
