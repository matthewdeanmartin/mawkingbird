import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { BotPeers } from './bot-peers';
import { ClientPrefs } from '../client-prefs';
import { ElizaService } from '../eliza/eliza.service';
import { ELIZA_PEER } from '../eliza/eliza-identity';
import { OPENROUTER_PEER } from '../providers/openrouter/openrouter-identity';

describe('BotPeers', () => {
  let bots: BotPeers;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    bots = TestBed.inject(BotPeers);
  });

  it('always offers Eliza, followed or not', () => {
    // Following her governs whether her posts reach your *timeline*. It was
    // never a sensible gate on whether you can talk to her, and once "Meet
    // Eliza" left the More menu it was a gate with no way to open it.
    expect(TestBed.inject(ElizaService).following()).toBe(false);

    expect(bots.peers().map((p) => p.peer)).toContain(ELIZA_PEER);
  });

  it('still offers her once she is followed', () => {
    TestBed.inject(ElizaService).follow();

    expect(bots.peers().map((p) => p.peer)).toContain(ELIZA_PEER);
  });

  it('does not stream for Eliza, who answers locally and free', () => {
    expect(bots.find(ELIZA_PEER)?.streams).toBe(false);
  });

  it('withholds OpenRouter until a key is connected', () => {
    // Without a key there is no model to talk to, so the option could only fail.
    expect(bots.peers().map((p) => p.peer)).not.toContain(OPENROUTER_PEER);
  });

  it('offers nobody at all when AI features are switched off', () => {
    TestBed.inject(ClientPrefs).setAiMode('off');

    expect(bots.peers()).toEqual([]);
  });

  it('brings everyone back when AI is switched on again', () => {
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setAiMode('off');
    prefs.setAiMode('on');

    expect(bots.peers().map((p) => p.peer)).toContain(ELIZA_PEER);
  });
});
