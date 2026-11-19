import { describe, expect, it } from 'vitest';
import { SetupFlow, withAnswered } from './setup-flow';
import type { SetupContext } from './setup-steps';

const ids = (ctx: SetupContext, answered: string[] = []) =>
  new SetupFlow(ctx, { answered }).visible().map((step) => step.id);

describe('setup flow', () => {
  it('gives a first account the full path and a later account the short one', () => {
    expect(ids({ first: true })).toEqual([
      'welcome',
      'purpose',
      'profile',
      'languages',
      'findable',
      'movers',
      'follow',
      'intro',
      'done',
    ]);
    expect(ids({ first: false })).toEqual([
      'purpose',
      'profile',
      'findable',
      'movers',
      'follow',
      'intro',
      'done',
    ]);
  });

  it('opens the Twitter or Bluesky step from the movers answer, and none for a pseudonym', () => {
    expect(ids({ first: false, movers: 'twitter' })).toContain('twitter');
    expect(ids({ first: false, movers: 'bluesky' })).toContain('bluesky');
    const pseudonym = ids({ first: false, purpose: 'pseudonym', movers: 'twitter' });
    expect(pseudonym).not.toContain('movers');
    expect(pseudonym).not.toContain('twitter');
  });

  it('walks next, back and progress over visible steps only', () => {
    const flow = new SetupFlow({ first: false, movers: 'bluesky' }, { answered: [] });
    expect(flow.after('movers')).toBe('bluesky');
    expect(flow.before('follow')).toBe('bluesky');
    expect(flow.before('purpose')).toBeNull();
    expect(flow.after('done')).toBeNull();
    expect(flow.progress('profile')).toEqual({ index: 2, total: 8 });
  });

  it('resumes at the first unanswered visible step, else Done', () => {
    expect(new SetupFlow({ first: true }, { answered: ['welcome', 'purpose'] }).resumeAt()).toBe(
      'profile',
    );
    const all = ids({ first: false });
    expect(new SetupFlow({ first: false }, { answered: all }).resumeAt()).toBe('done');
  });

  it('records an answer once', () => {
    expect(withAnswered(['a'], 'a')).toEqual(['a']);
    expect(withAnswered(['a'], 'b')).toEqual(['a', 'b']);
  });
});
