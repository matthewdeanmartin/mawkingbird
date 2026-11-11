import { describe, expect, it } from 'vitest';
import { HEATED_THRESHOLD, rageScore, stripHtml } from './sentiment';

describe('stripHtml', () => {
  it('drops tags, decodes entities, and collapses whitespace', () => {
    expect(stripHtml('<p>Hello <a href="x">world</a></p><p>&amp; more</p>')).toBe(
      'Hello world & more',
    );
  });
});

describe('rageScore', () => {
  it('scores neutral text as zero', () => {
    expect(rageScore('What a lovely afternoon for birdwatching.')).toBe(0);
  });

  it('scores hostile keywords', () => {
    expect(rageScore('These corrupt liars are pathetic')).toBeGreaterThanOrEqual(HEATED_THRESHOLD);
  });

  it('counts a repeated word only once', () => {
    expect(rageScore('trash trash trash')).toBe(rageScore('trash'));
  });

  it('treats a whole-word profanity hit as heated', () => {
    expect(rageScore('This release is dogshit.')).toBeGreaterThanOrEqual(HEATED_THRESHOLD);
    expect(rageScore('This is shit.')).toBeGreaterThanOrEqual(HEATED_THRESHOLD);
  });

  it('does not match profanity inside an otherwise harmless word', () => {
    expect(rageScore('I made a shiitake mushroom risotto.')).toBe(0);
    expect(rageScore('Press the button to continue.')).toBe(0);
    expect(rageScore('Classic assessment of the class.')).toBe(0);
  });

  it('never treats one- or two-letter words as profanity', () => {
    expect(rageScore('As is, it works as well as it can.')).toBe(0);
    expect(rageScore('a ok um hi')).toBe(0);
  });

  it('does not flag ordinary words, proper nouns, or clinical terms from the list', () => {
    expect(rageScore('Oh my god, the pawn sacrifice was bloody brilliant.')).toBe(0);
    expect(rageScore('Sex education and testicle self-exams save lives.')).toBe(0);
    expect(rageScore('Turned the knob, fixed the flange, screwing it back on.')).toBe(0);
    expect(rageScore('Tony Hoare and Brian Cox on stage together.')).toBe(0);
  });

  it('recognizes profanity with vowels replaced by asterisks', () => {
    expect(rageScore('This is f*cking broken.')).toBeGreaterThanOrEqual(HEATED_THRESHOLD);
    expect(rageScore('What a sh*t show.')).toBeGreaterThanOrEqual(HEATED_THRESHOLD);
  });

  it('treats strongly negative emoji as heated', () => {
    expect(rageScore('What a day 🤬')).toBeGreaterThanOrEqual(HEATED_THRESHOLD);
    expect(rageScore('That is disgusting 🤮')).toBeGreaterThanOrEqual(HEATED_THRESHOLD);
  });

  it('matches two-word phrases', () => {
    expect(rageScore('so sick of this, honestly fed up')).toBeGreaterThan(0);
  });

  it('adds shouting and exclamation cues', () => {
    const calm = rageScore('this is terrible');
    const shouting = rageScore('THIS WHOLE THING IS TERRIBLE!!!');
    expect(shouting).toBeGreaterThan(calm);
  });

  it('does not flag mild enthusiasm', () => {
    expect(rageScore('Great show tonight! Loved it.')).toBeLessThan(HEATED_THRESHOLD);
  });
});
