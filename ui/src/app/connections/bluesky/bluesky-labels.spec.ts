import { describe, expect, it } from 'vitest';
import {
  BskyLabelInputs,
  DEFAULT_LABEL_INPUTS,
  decideLabels,
  definitionsOf,
  labelDefKey,
  labelPrefKey,
} from './bluesky-labels';

const AUTHOR = 'did:plc:author';
const BSKY_MOD = 'did:plc:ar7c4by46qjdydhdevvrndac';
const LABELER = 'did:plc:labeler';
const STRANGER = 'did:plc:stranger';

function inputs(overrides: Partial<BskyLabelInputs> = {}): BskyLabelInputs {
  return { ...DEFAULT_LABEL_INPUTS, labelers: [LABELER], ...overrides };
}

describe('decideLabels', () => {
  it('does nothing without labels', () => {
    expect(decideLabels(undefined, AUTHOR, inputs())).toEqual({
      hide: false,
      warn: [],
      blurMedia: false,
    });
  });

  it('hides adult-only labels while adult content is off, whatever the preference', () => {
    const prefs = new Map([[labelPrefKey('sexual'), 'ignore' as const]]);
    const sexual = [{ val: 'sexual', src: AUTHOR }];
    expect(decideLabels(sexual, AUTHOR, inputs({ prefs })).hide).toBe(true);
    expect(decideLabels(sexual, AUTHOR, inputs({ prefs, adultContent: true }))).toEqual({
      hide: false,
      warn: [],
      blurMedia: false,
    });
  });

  it('applies the global defaults once adult content is on', () => {
    const on = inputs({ adultContent: true });
    expect(decideLabels([{ val: 'porn', src: AUTHOR }], AUTHOR, on).hide).toBe(true);
    expect(decideLabels([{ val: 'sexual', src: AUTHOR }], AUTHOR, on).blurMedia).toBe(true);
    expect(decideLabels([{ val: 'gore', src: BSKY_MOD }], AUTHOR, on).blurMedia).toBe(true);
    expect(decideLabels([{ val: 'nudity', src: AUTHOR }], AUTHOR, on).blurMedia).toBe(false);
  });

  it('honours the reader preference for a global label', () => {
    const prefs = new Map([[labelPrefKey('nudity'), 'warn' as const]]);
    expect(
      decideLabels([{ val: 'nudity', src: AUTHOR }], AUTHOR, inputs({ prefs })).blurMedia,
    ).toBe(true);
  });

  it('hides for !hide and warns for !warn, but never from the author themself', () => {
    expect(decideLabels([{ val: '!hide', src: BSKY_MOD }], AUTHOR, inputs()).hide).toBe(true);
    expect(decideLabels([{ val: '!warn', src: LABELER }], AUTHOR, inputs()).warn).toEqual([
      'Content warning',
    ]);
    expect(decideLabels([{ val: '!hide', src: AUTHOR }], AUTHOR, inputs()).hide).toBe(false);
  });

  it('ignores labels from services the reader has not subscribed to', () => {
    expect(decideLabels([{ val: '!hide', src: STRANGER }], AUTHOR, inputs()).hide).toBe(false);
  });

  it('drops a label withdrawn by a negation from the same source', () => {
    const labels = [
      { val: '!hide', src: BSKY_MOD, uri: 'at://x' },
      { val: '!hide', src: BSKY_MOD, uri: 'at://x', neg: true },
    ];
    expect(decideLabels(labels, AUTHOR, inputs()).hide).toBe(false);
  });

  it('applies a labeler custom value by its definition and the per-labeler preference', () => {
    const defs = new Map([
      [
        labelDefKey(LABELER, 'spoilers'),
        {
          identifier: 'spoilers',
          blurs: 'content' as const,
          severity: 'alert' as const,
          defaultSetting: 'warn' as const,
          name: 'Spoilers',
        },
      ],
    ]);
    const label = [{ val: 'spoilers', src: LABELER }];
    expect(decideLabels(label, AUTHOR, inputs({ defs })).warn).toEqual(['Spoilers']);
    const prefs = new Map([[labelPrefKey('spoilers', LABELER), 'hide' as const]]);
    expect(decideLabels(label, AUTHOR, inputs({ defs, prefs })).hide).toBe(true);
    // The same value from another labeler is not that labeler's definition.
    expect(
      decideLabels([{ val: 'spoilers', src: BSKY_MOD }], AUTHOR, inputs({ defs })).warn,
    ).toEqual([]);
  });
});

describe('definitionsOf', () => {
  it('reads the English name and normalises unknown enum values', () => {
    const [[key, def]] = definitionsOf(LABELER, [
      {
        identifier: 'rude',
        blurs: 'content',
        severity: 'loud',
        defaultSetting: 'warn',
        locales: [
          { lang: 'ja', name: '失礼' },
          { lang: 'en', name: 'Rude' },
        ],
      },
    ]);
    expect(key).toBe(labelDefKey(LABELER, 'rude'));
    expect(def).toMatchObject({
      blurs: 'content',
      severity: 'none',
      defaultSetting: 'warn',
      name: 'Rude',
    });
  });
});
