import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AdoptionDialog } from './adoption-dialog';
import type { AdoptionChoice } from '../../../../providers/account/collection-adoption';

describe('AdoptionDialog', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<AdoptionDialog>>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(AdoptionDialog);
    fixture.componentRef.setInput('collection', 'trust');
    fixture.componentRef.setInput('localCount', 3);
    fixture.componentRef.setInput('remoteCount', 5);
    fixture.detectChanges();
  });

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  /**
   * The dialog's answer buttons, in order: merge, replace, decline.
   *
   * Found by position rather than by their words. These labels name counts
   * ("Keep all 8") and get reworded whenever the dialog is made clearer, and a
   * test that pins the prose fails on every such edit while telling us nothing
   * about the behaviour it guards — which is only ever *which answer each
   * button emits*.
   */
  function answers(): HTMLButtonElement[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].filter(
      (candidate) => candidate.getAttribute('aria-label') !== 'Cancel',
    );
  }

  it('says how much is on each side', () => {
    expect(text()).toContain('3');
    expect(text()).toContain('5');
    expect(text()).toContain('trusted accounts');
  });

  it('names the collection it is asking about', () => {
    fixture.componentRef.setInput('collection', 'feeds');
    fixture.detectChanges();

    expect(text()).toContain('feed subscriptions');
  });

  it('offers merge and replace, and no third answer', () => {
    // Exactly three: keep both, take the account's, and decline — and nothing
    // that would overwrite the account with this browser's copy.
    expect(answers()).toHaveLength(3);
  });

  it('says out loud that overwriting the account is not offered', () => {
    // Someone looking for that option should find out here that it does not
    // exist, rather than hunting for it.
    expect(text()).toContain("There's no option to replace your account's copy");
  });

  it('emits the chosen answer', () => {
    const chosen: AdoptionChoice[] = [];
    fixture.componentInstance.chose.subscribe((choice) => chosen.push(choice));

    answers()[0].click();

    expect(chosen).toEqual(['merge']);
  });

  it('emits replace', () => {
    const chosen: AdoptionChoice[] = [];
    fixture.componentInstance.chose.subscribe((choice) => chosen.push(choice));

    answers()[1].click();

    expect(chosen).toEqual(['replace']);
  });

  it('can be backed out of', () => {
    // Unlike the welcome dialog: forcing an irreversible data decision on the
    // spot is how people lose things.
    let cancelled = 0;
    fixture.componentInstance.cancelled.subscribe(() => cancelled++);

    answers()[2].click();

    expect(cancelled).toBe(1);
  });

  it('can be dismissed by clicking away', () => {
    let cancelled = 0;
    fixture.componentInstance.cancelled.subscribe(() => cancelled++);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.ad-backdrop')
      ?.click();

    expect(cancelled).toBe(1);
  });

  it('locks the choices once one is taken', () => {
    // The write is in flight; a second answer would race the first.
    answers()[0].click();
    fixture.detectChanges();

    expect(answers()[0].disabled).toBe(true);
    expect(answers()[1].disabled).toBe(true);
  });
});
