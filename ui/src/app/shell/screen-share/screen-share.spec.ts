import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AccountChoice } from '../../platform/session/auth';
import { scopeSuffixForDid } from '../../platform/session/account-scope';
import { ScreenShare } from './screen-share';

describe('ScreenShare', () => {
  beforeEach(() => localStorage.clear());

  it('stays on across reloads until turned off', () => {
    TestBed.inject(ScreenShare).set(true);
    TestBed.resetTestingModule();
    expect(TestBed.inject(ScreenShare).enabled()).toBe(true);
    TestBed.inject(ScreenShare).set(false);
    TestBed.resetTestingModule();
    expect(TestBed.inject(ScreenShare).enabled()).toBe(false);
  });

  it('covers private pages only while on', () => {
    const screenShare = TestBed.inject(ScreenShare);
    expect(screenShare.covers('/conversations')).toBe(false);
    screenShare.set(true);
    for (const url of [
      '/conversations?open=x',
      '/notifications',
      '/drafts',
      '/bsky/chat/a',
      '/eliza/chat',
    ])
      expect(screenShare.covers(url), url).toBe(true);
    for (const url of ['/home', '/notifications-settings', '/accounts/1'])
      expect(screenShare.covers(url), url).toBe(false);
  });

  it('treats posts that name no audience as public', () => {
    const screenShare = TestBed.inject(ScreenShare);
    screenShare.set(true);
    expect(screenShare.hides({})).toBe(false);
    expect(screenShare.hides({ visibility: 'limited' })).toBe(true);
  });

  it('leaves pseudonymous accounts out of a switcher, of any network', () => {
    const screenShare = TestBed.inject(ScreenShare);
    const did = 'did:plc:alt';
    localStorage.setItem(
      `mockingbird_pseudonymity${scopeSuffixForDid(did)}`,
      JSON.stringify({ enabled: true }),
    );
    const choices = [
      { key: 'b', kind: 'bluesky', did, token: null, server: '', account: null },
      { key: 'anonymous', kind: 'anonymous', token: null, server: '', account: null },
    ] as AccountChoice[];
    expect(screenShare.shown(choices)).toHaveLength(2);
    screenShare.set(true);
    expect(screenShare.shown(choices).map((choice) => choice.key)).toEqual(['anonymous']);
  });
});
