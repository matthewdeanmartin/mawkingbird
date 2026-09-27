import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DONE, OnboardingFlow, SERVER_REFUSED } from './onboarding-flow';
import { OnboardingContext, OnboardingQuestion, OnboardingValue } from './onboarding-questions';
import { readOnboardingAccount, readOnboardingApp } from './onboarding-store';

/** A tiny settings world the synthetic questions read and write. */
function world() {
  const state = {
    secret: signal(false),
    theme: signal('auto'),
    lock: signal(false),
    colour: signal('blue'),
  };
  const serverFails = signal(false);
  const q = (partial: Partial<OnboardingQuestion> & Pick<OnboardingQuestion, 'id'>) =>
    ({
      scope: 'app',
      title: () => partial.id,
      control: { kind: 'toggle', label: partial.id },
      when: () => true,
      ...partial,
    }) as OnboardingQuestion;
  const questions: OnboardingQuestion[] = [
    q({
      id: 'secret',
      scope: 'account',
      read: () => state.secret(),
      apply: (_c, v) => state.secret.set(v === true),
    }),
    q({
      id: 'lock',
      scope: 'server',
      when: () => state.secret(),
      read: () => state.lock(),
      suggest: () => true,
      apply: async (_c, v) => {
        if (serverFails()) throw new Error('422');
        state.lock.set(v === true);
      },
    }),
    q({ id: 'theme', read: () => state.theme(), apply: (_c, v) => state.theme.set(String(v)) }),
    q({ id: 'colour', read: () => state.colour(), apply: (_c, v) => state.colour.set(String(v)) }),
    q({ id: 'people', scope: 'account', control: { kind: 'action', label: 'Go', route: '/x' } }),
  ];
  return { state, serverFails, questions, ctx: {} as OnboardingContext };
}

const ids = (flow: OnboardingFlow) => flow.list().map((q) => q.id);

describe('OnboardingFlow', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_token', 'alice-token');
    TestBed.configureTestingModule({});
  });

  it('opens a branch when an answer calls for it, and counts it in the progress', async () => {
    const { questions, ctx } = world();
    const flow = new OnboardingFlow(ctx, questions, 'auto');
    expect(ids(flow)).toEqual(['secret', 'theme', 'colour', 'people']);
    expect([flow.position(), flow.total()]).toEqual([1, 4]);

    await flow.select(true);
    expect(ids(flow)).toEqual(['secret', 'lock', 'theme', 'colour', 'people']);
    await flow.next();
    expect(flow.currentId()).toBe('lock');
    expect([flow.position(), flow.total()]).toEqual([2, 5]);
  });

  it('applies a preselected suggestion on Next', async () => {
    const { state, questions, ctx } = world();
    state.secret.set(true);
    const flow = new OnboardingFlow(ctx, questions, 'auto');
    await flow.next();
    expect(flow.value()).toBe(true);
    expect(state.lock()).toBe(false);

    await flow.next();
    expect(state.lock()).toBe(true);
    expect(flow.currentId()).toBe('theme');
  });

  it('applies a change at once, and Skip puts it back', async () => {
    const { state, questions, ctx } = world();
    const flow = new OnboardingFlow(ctx, questions, 'auto');
    await flow.skip();
    await flow.select('dark');
    expect(state.theme()).toBe('dark');

    await flow.skip();
    expect(state.theme()).toBe('auto');
    expect(flow.currentId()).toBe('colour');
  });

  it('keeps an applied value when going Back', async () => {
    const { state, questions, ctx } = world();
    const flow = new OnboardingFlow(ctx, questions, 'auto');
    await flow.skip();
    await flow.select('dark');
    await flow.next();
    flow.back();
    expect(flow.currentId()).toBe('theme');
    expect(flow.value()).toBe('dark');
    expect(state.theme()).toBe('dark');
  });

  it('reverts a server setting the server refused, and stays on the card', async () => {
    const { state, serverFails, questions, ctx } = world();
    state.secret.set(true);
    serverFails.set(true);
    const flow = new OnboardingFlow(ctx, questions, 'auto');
    await flow.next();

    // The preselected suggestion fails on Next: stay, and show the real value.
    await flow.next();
    expect(flow.currentId()).toBe('lock');
    expect(flow.value()).toBe(false);
    expect(flow.error()).toBe(SERVER_REFUSED);

    await flow.select(true);
    expect(flow.value()).toBe(false);
    expect(flow.error()).toBe(SERVER_REFUSED);

    // Next now keeps the setting the server has.
    await flow.next();
    expect(flow.currentId()).toBe('theme');
    expect(state.lock()).toBe(false);
  });

  it('resumes where Quit left off', async () => {
    const { questions, ctx } = world();
    const first = new OnboardingFlow(ctx, questions, 'auto');
    await first.next();
    await first.next();
    expect(first.currentId()).toBe('colour');

    const again = new OnboardingFlow(ctx, questions, 'menu');
    expect(again.currentId()).toBe('colour');
    expect(ids(again)).toEqual(['colour', 'people']);
  });

  it('asks app-wide questions once per browser, account questions per account', async () => {
    const { questions, ctx } = world();
    const alice = new OnboardingFlow(ctx, questions, 'auto');
    while (alice.currentId() !== DONE) await alice.next();
    expect(readOnboardingApp().completed).toBe(true);
    expect(readOnboardingAccount()?.finished).toBe(true);

    localStorage.setItem('mastodon_mock_token', 'bob-token');
    const bob = new OnboardingFlow(ctx, questions, 'auto');
    expect(ids(bob)).toEqual(['secret', 'people']);
  });

  it('turns the menu entry into a full rerun once everything is answered', async () => {
    const { questions, ctx } = world();
    const flow = new OnboardingFlow(ctx, questions, 'auto');
    while (flow.currentId() !== DONE) await flow.next();

    const rerun = new OnboardingFlow(ctx, questions, 'menu');
    expect(rerun.currentId()).toBe('secret');
    expect(ids(rerun)).toEqual(['secret', 'theme', 'colour', 'people']);
    // Auto-start never reruns: an onboarded account has nothing to resume.
    expect(new OnboardingFlow(ctx, questions, 'auto').currentId()).toBe(DONE);
  });

  it('counts an action card as answered when its button is used', () => {
    const { questions, ctx } = world();
    const flow = new OnboardingFlow(ctx, questions, 'auto');
    flow.currentId.set('people');
    flow.answerCurrent();
    expect(readOnboardingAccount()?.answered).toContain('people');
  });

  it('compares list answers by content', async () => {
    const values: OnboardingValue[] = [];
    const flow = new OnboardingFlow(
      {} as OnboardingContext,
      [
        {
          id: 'langs',
          scope: 'app',
          title: () => 'langs',
          control: { kind: 'multi', options: () => [] },
          when: () => true,
          read: () => ['en', 'de'],
          apply: (_c, v) => void values.push(v),
        },
      ],
      'auto',
    );
    await flow.next();
    expect(values).toEqual([]);
  });
});
