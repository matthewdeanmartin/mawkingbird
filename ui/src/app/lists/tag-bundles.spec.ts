import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_BUNDLE_TAGS, normalizeTag, TagBundles } from './tag-bundles';

describe('normalizeTag', () => {
  it('strips the sigil and lowercases', () => {
    expect(normalizeTag('#Rust')).toBe('rust');
  });

  it('strips repeated sigils and surrounding space', () => {
    expect(normalizeTag('  ##rust ')).toBe('rust');
  });

  it('removes inner whitespace, since a hashtag has none', () => {
    expect(normalizeTag('#web assembly')).toBe('webassembly');
  });
});

describe('TagBundles', () => {
  let bundles: TagBundles;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    bundles = TestBed.inject(TagBundles);
  });

  it('starts empty', () => {
    expect(bundles.bundles()).toEqual([]);
  });

  it('creates a bundle with normalized tags', () => {
    const bundle = bundles.create('Systems', ['#Rust', 'zig']);
    expect(bundle.tags).toEqual(['rust', 'zig']);
  });

  it('persists across instances', () => {
    bundles.create('Systems', ['rust']);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(TagBundles).bundles()[0].tags).toEqual(['rust']);
  });

  it('treats spellings of one tag as one tag', () => {
    const bundle = bundles.create('Systems', ['#Rust', 'rust', 'RUST']);
    expect(bundle.tags).toEqual(['rust']);
  });

  it('adds and removes tags', () => {
    const bundle = bundles.create('Systems');
    expect(bundles.addTag(bundle.id, '#rust')).toBe(true);
    expect(bundles.hasTag(bundle.id, 'RUST')).toBe(true);
    bundles.removeTag(bundle.id, 'rust');
    expect(bundles.hasTag(bundle.id, 'rust')).toBe(false);
  });

  it('refuses a duplicate rather than appearing to add it', () => {
    const bundle = bundles.create('Systems', ['rust']);
    expect(bundles.addTag(bundle.id, 'Rust')).toBe(false);
    expect(bundles.get(bundle.id)!.tags).toEqual(['rust']);
  });

  it('finds every bundle a tag is in', () => {
    const a = bundles.create('One', ['rust']);
    const b = bundles.create('Two', ['rust']);
    bundles.create('Three', ['zig']);
    expect(bundles.bundlesWith('#Rust').map((x) => x.id)).toEqual([a.id, b.id]);
  });

  describe('the ten-tag cap', () => {
    // Each tag is one API call every time the feed opens, so this is a politeness
    // limit against other people's servers. It lives in the store precisely so that no
    // caller — including a future one — can exceed it.

    const eleven = Array.from({ length: 11 }, (_, i) => `tag${i}`);

    it('caps what create() accepts', () => {
      const bundle = bundles.create('Greedy', eleven);
      expect(bundle.tags).toHaveLength(MAX_BUNDLE_TAGS);
    });

    it('refuses the eleventh add, and says so', () => {
      const bundle = bundles.create('Full', eleven.slice(0, MAX_BUNDLE_TAGS));
      expect(bundles.isFull(bundle.id)).toBe(true);
      expect(bundles.addTag(bundle.id, 'onemore')).toBe(false);
      expect(bundles.get(bundle.id)!.tags).toHaveLength(MAX_BUNDLE_TAGS);
    });

    it('takes another tag once one is removed', () => {
      const bundle = bundles.create('Full', eleven.slice(0, MAX_BUNDLE_TAGS));
      bundles.removeTag(bundle.id, 'tag0');
      expect(bundles.isFull(bundle.id)).toBe(false);
      expect(bundles.addTag(bundle.id, 'onemore')).toBe(true);
    });

    it('re-caps a hand-edited blob on read', () => {
      // A limit enforced only by a disabled button is not a limit: someone editing
      // localStorage must not be able to hand the app an eleven-call feed.
      const key = Object.keys(localStorage).find((k) => k.startsWith('mockingbird_tag_bundles'));
      localStorage.setItem(
        key ?? 'mockingbird_tag_bundles',
        JSON.stringify({
          version: 1,
          bundles: [{ id: 'x', title: 'Hand edited', tags: eleven, createdAt: '' }],
        }),
      );
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      expect(TestBed.inject(TagBundles).bundles()[0].tags).toHaveLength(MAX_BUNDLE_TAGS);
    });
  });

  describe('stored state is cache, not records', () => {
    it('discards an unrecognised version rather than migrating it', () => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('mockingbird_tag_bundles'));
      localStorage.setItem(
        key ?? 'mockingbird_tag_bundles',
        JSON.stringify({ version: 99, bundles: [{ id: 'x', title: 'Old', tags: [] }] }),
      );
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      expect(TestBed.inject(TagBundles).bundles()).toEqual([]);
    });

    it('survives a corrupt blob', () => {
      localStorage.setItem('mockingbird_tag_bundles', 'not json');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      expect(TestBed.inject(TagBundles).bundles()).toEqual([]);
    });
  });
});
