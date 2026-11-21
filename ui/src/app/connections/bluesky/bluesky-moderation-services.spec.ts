import { HttpParams } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyApi } from './bluesky-api';
import { CONFIGURABLE_LABELS, currentVisibility, labelPrefKey } from './bluesky-labels';
import { BlueskyModeration } from './bluesky-moderation';
import { BlueskyModerationInbox } from './bluesky-moderation-inbox';
import { BlueskyModerationState } from './bluesky-moderation-state';
import { BlueskyPds } from './bluesky-pds';
import { BskyPreference } from './bluesky-preferences';
import { BlueskySession } from './bluesky-session';
import {
  BLUESKY_REPORT_GROUPS,
  defaultBlueskyReason,
} from '../../moderation/report-dialog/bluesky-report-reasons';

describe('Bluesky moderation services (parity sprint 5)', () => {
  let prefs: BskyPreference[];
  let request: ReturnType<typeof vi.fn>;
  let get: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prefs = [
      {
        $type: 'app.bsky.actor.defs#contentLabelPref',
        label: 'rude',
        labelerDid: 'did:plc:other',
        visibility: 'warn',
      },
      { $type: 'app.bsky.actor.defs#mutedWordsPref', items: [] },
    ];
    request = vi.fn((nsid: string, body: { preferences?: BskyPreference[] }) => {
      if (nsid === 'app.bsky.actor.putPreferences') prefs = body.preferences!;
      return of({});
    });
    get = vi.fn((nsid: string) =>
      of(
        nsid === 'tools.ozone.inbox.listReports'
          ? { reports: [{ id: 1, createdAt: 'x' }], cursor: 'c' }
          : { standing: 'good' },
      ),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: BlueskySession, useValue: { session: () => ({ did: 'did:plc:me' }) } },
        { provide: BlueskyPds, useValue: { resolve: () => of('https://pds.example') } },
        {
          provide: BlueskyApi,
          useValue: { getPreferences: () => of({ preferences: prefs }), request, get },
        },
      ],
    });
  });

  it('turns adult content on and sets one labeler’s label without touching another’s', async () => {
    const moderation = TestBed.inject(BlueskyModeration);
    await moderation.setAdultContent(true);
    await moderation.setLabelVisibility('rude', 'hide', 'did:plc:mine');
    await moderation.setLabelVisibility('rude', 'ignore', 'did:plc:mine');
    expect(prefs).toContainEqual({ $type: 'app.bsky.actor.defs#adultContentPref', enabled: true });
    const rude = prefs.filter((p) => p['label'] === 'rude');
    expect(rude).toEqual([
      {
        $type: 'app.bsky.actor.defs#contentLabelPref',
        label: 'rude',
        labelerDid: 'did:plc:other',
        visibility: 'warn',
      },
      {
        $type: 'app.bsky.actor.defs#contentLabelPref',
        label: 'rude',
        visibility: 'ignore',
        labelerDid: 'did:plc:mine',
      },
    ]);
    const state = TestBed.inject(BlueskyModerationState);
    expect(state.adultContent()).toBe(true);
    expect(state.labelPrefs().get(labelPrefKey('rude', 'did:plc:mine'))).toBe('ignore');
  });

  it('shows adult-only labels as hidden while adult content is off', () => {
    const porn = CONFIGURABLE_LABELS.find((d) => d.identifier === 'porn')!;
    const nudity = CONFIGURABLE_LABELS.find((d) => d.identifier === 'nudity')!;
    const prefs = new Map([[labelPrefKey('porn'), 'show' as const]]);
    expect(currentVisibility(porn, { adultContent: false, prefs })).toBe('hide');
    expect(currentVisibility(porn, { adultContent: true, prefs })).toBe('ignore');
    expect(currentVisibility(nudity, { adultContent: false, prefs: new Map() })).toBe('ignore');
  });

  it('reads the inbox through the PDS, proxied to Bluesky’s moderation service', async () => {
    const inbox = TestBed.inject(BlueskyModerationInbox);
    expect(await inbox.reports()).toEqual({ reports: [{ id: 1, createdAt: 'x' }], cursor: 'c' });
    expect(get).toHaveBeenCalledWith(
      'tools.ozone.inbox.listReports',
      expect.any(HttpParams),
      { 'atproto-proxy': 'did:plc:ar7c4by46qjdydhdevvrndac#atproto_labeler' },
      'https://pds.example',
    );
    expect(await inbox.standing()).toEqual({ standing: 'good' });
  });
});

describe('Bluesky report reasons', () => {
  it('offers every reason once, as tools.ozone.report values with copy keys', () => {
    const values = BLUESKY_REPORT_GROUPS.flatMap((g) => g.reasons.map((r) => r.value));
    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain('tools.ozone.report.defs#reasonChildSafetyCSAM');
    expect(values).toContain('tools.ozone.report.defs#reasonSexualNCII');
    expect(values).toContain('tools.ozone.report.defs#reasonRuleBanEvasion');
    expect(values.every((v) => /^tools\.ozone\.report\.defs#reason[A-Z]\w+$/.test(v))).toBe(true);
    expect(defaultBlueskyReason('spam')).toBe('tools.ozone.report.defs#reasonMisleadingSpam');
  });

  it('sends a report to a chosen moderation service through the PDS', async () => {
    const request = vi.fn(() => of({}));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BlueskySession,
          useValue: { session: () => ({ did: 'did:plc:me' }), isOAuthSession: () => false },
        },
      ],
    });
    const api = TestBed.inject(BlueskyApi);
    (api as unknown as { request: typeof request }).request = request;
    await firstValueFrom(
      api.reportAccount(
        'did:plc:them',
        'tools.ozone.report.defs#reasonMisleadingScam',
        ' x ',
        'did:plc:lab',
      ),
    );
    expect(request).toHaveBeenCalledWith(
      'com.atproto.moderation.createReport',
      expect.objectContaining({
        reasonType: 'tools.ozone.report.defs#reasonMisleadingScam',
        reason: 'x',
      }),
      { 'atproto-proxy': 'did:plc:lab#atproto_labeler' },
    );
  });
});
