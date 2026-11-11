import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLUS_FEATURES_KEY, PlusFeatures } from './plus-features';

describe('PlusFeatures', () => {
  let features: PlusFeatures;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    features = TestBed.inject(PlusFeatures);
    features.refresh();
  });

  it('starts undecided, with everything on', () => {
    // `undecided` is not `off`: the dialog has to distinguish "never asked"
    // from "asked, said no", or it either nags or never appears.
    expect(features.decided()).toBe(false);
    expect(features.isOn('feedsSync')).toBe(true);
    expect(features.isOn('corsProxy')).toBe(true);
  });

  it('records an answer', () => {
    features.save({
      corsProxy: false,
      trustSync: true,
      listsSync: false,
      feedsSync: true,
    });

    expect(features.decided()).toBe(true);
    expect(features.isOn('corsProxy')).toBe(false);
    expect(features.isOn('listsSync')).toBe(false);
    expect(features.isOn('feedsSync')).toBe(true);
  });

  it('survives a reload', () => {
    features.save({
      corsProxy: false,
      trustSync: true,
      listsSync: true,
      feedsSync: true,
    });

    features.refresh();

    expect(features.decided()).toBe(true);
    expect(features.isOn('corsProxy')).toBe(false);
  });

  it('changes one feature without disturbing the others', () => {
    features.save({
      corsProxy: true,
      trustSync: true,
      listsSync: true,
      feedsSync: true,
    });

    features.set('trustSync', false);

    expect(features.isOn('trustSync')).toBe(false);
    expect(features.isOn('feedsSync')).toBe(true);
    // Still answered — changing a setting is not un-answering the dialog.
    expect(features.decided()).toBe(true);
  });

  it('forgets everything on reset, so the next account decides for itself', () => {
    features.save({
      corsProxy: false,
      trustSync: false,
      listsSync: false,
      feedsSync: false,
    });

    features.reset();

    expect(features.decided()).toBe(false);
    expect(features.isOn('corsProxy')).toBe(true);
    expect(localStorage.getItem(PLUS_FEATURES_KEY)).toBeNull();
  });

  it('asks again rather than guessing when the record is damaged', () => {
    localStorage.setItem(PLUS_FEATURES_KEY, '{ not json');

    features.refresh();

    // Being asked twice is a small annoyance; silently switching off something
    // someone turned on is not.
    expect(features.decided()).toBe(false);
    expect(features.isOn('feedsSync')).toBe(true);
  });

  it('ignores junk values inside an otherwise valid record', () => {
    localStorage.setItem(
      PLUS_FEATURES_KEY,
      JSON.stringify({ decided: true, enabled: { corsProxy: 'yes', trustSync: false } }),
    );

    features.refresh();

    // A non-boolean is not an answer, so the default stands.
    expect(features.isOn('corsProxy')).toBe(true);
    expect(features.isOn('trustSync')).toBe(false);
  });

  it('lists every feature with its current setting', () => {
    features.set('feedsSync', false);

    const rows = features.all();

    // Five: settings sync is no longer a stored preference, while the test
    // vault is now a real preference rather than a grey roadmap row. Settings
    // sync remains a
    // view of `ProfileSync` via `SettingsSyncToggle`, because two switches for
    // one thing is what let the Plus page and the Config page disagree.
    expect(rows).toHaveLength(5);
    expect(rows.find((row) => row.feature === 'feedsSync')?.on).toBe(false);
    expect(rows.find((row) => row.feature === 'listsSync')?.on).toBe(true);
    expect(rows.find((row) => row.feature === 'apiKeys')?.on).toBe(true);
  });
});
