import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { HugoEdit, HugoEditSession } from './hugo-edit-session';

const EDIT: HugoEdit = {
  path: 'content/posts/hello.md',
  sha: 'blob-1',
  format: 'toml',
  date: '2026-01-02T03:04:05Z',
  extraLines: ['weight = 5'],
  originalTitle: 'Hello',
};

describe('HugoEditSession', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty', () => {
    const session = TestBed.inject(HugoEditSession);

    expect(session.editing()).toBe(false);
    expect(session.current()).toBeNull();
  });

  it('holds the edit across repeated reads, unlike the one-shot draft handoff', () => {
    const session = TestBed.inject(HugoEditSession);
    session.start(EDIT);

    // Read twice: the composer needs it at seed time AND again at submit time.
    expect(session.current()?.path).toBe('content/posts/hello.md');
    expect(session.current()?.sha).toBe('blob-1');
    expect(session.editing()).toBe(true);
  });

  it('advances the sha so a second consecutive save does not 409 on our own commit', () => {
    const session = TestBed.inject(HugoEditSession);
    session.start(EDIT);

    session.advance('blob-2');

    expect(session.current()?.sha).toBe('blob-2');
    // Everything else is untouched.
    expect(session.current()?.extraLines).toEqual(['weight = 5']);
    expect(session.current()?.date).toBe('2026-01-02T03:04:05Z');
  });

  it('ignores an advance when nothing is being edited', () => {
    const session = TestBed.inject(HugoEditSession);

    session.advance('blob-2');

    expect(session.current()).toBeNull();
  });

  it('clears on finish and on cancel', () => {
    const session = TestBed.inject(HugoEditSession);

    session.start(EDIT);
    session.finish();
    expect(session.editing()).toBe(false);

    session.start(EDIT);
    session.cancel();
    expect(session.editing()).toBe(false);
  });

  it('never writes to storage — a parked edit must not survive a reload', () => {
    const session = TestBed.inject(HugoEditSession);
    session.start(EDIT);

    // An edit that outlived a reload would attach a stale path and sha to
    // whatever the user writes next.
    const keys = Object.keys(localStorage).filter((key) => key.includes('hugo'));
    expect(keys).toHaveLength(0);
  });
});
