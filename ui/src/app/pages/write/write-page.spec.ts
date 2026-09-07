import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, WritableSignal, signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { BlueskyPublication } from './bluesky-publication';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { ClientPrefs } from '../../client-prefs';
import { DraftMedia, Drafts } from '../../drafts';
import { Account, ScheduledStatus, Status } from '../../models';
import { PostTarget } from '../../compose/compose';
import { TranslateResult } from '../../compose/translate-dialog/translate-dialog';
import {
  Proofreader,
  ProofreadingFinding,
  ProofreadingRequestPreview,
} from '../../compose/proofreader';
import { AiAvailability } from '../../ai-availability';
import { OpenRouterSession } from '../../providers/openrouter/openrouter-session';
import { PkmItem } from '../../pkm/pkm-source';
import { PkmKind } from '../../pkm/pkm-tags';
import { WIZARD_STEPS, WizardStep } from '../../publish-wizard';
import { QualityFinding } from './quality-checks';
import { PasteHistory } from '../../providers/paste/paste-history';
import { WritingZen } from '../../writing-zen';
import { DraftItem } from '../drafts/draft-items';
import { DraftSources } from '../drafts/draft-sources';
import { Segment, SplitMode } from './split-modes';
import { Notice, WritePage } from './write-page';
import { WriteWorkspace } from './write-workspace';

interface PageInternals {
  body: WritableSignal<string>;
  editing: WritableSignal<{ key: string; localId: string | null } | null>;
  dirty: WritableSignal<boolean>;
  notice: WritableSignal<Notice | null>;
  pendingSwitch: WritableSignal<{ run: () => void } | null>;
  segments: Signal<Segment[]>;
  splitMode: Signal<SplitMode>;
  sources: DraftSources;
  tab: WritableSignal<'write' | 'notes'>;
  jotText: WritableSignal<string>;
  jotKind: WritableSignal<PkmKind>;
  pkmVisible: Signal<PkmItem[]>;
  jot(): void;
  openNote(item: PkmItem): void;
  setPkmFilter(kind: PkmKind | null): void;
  boardOpen: WritableSignal<boolean>;
  openBoard(): void;
  closeBoard(): void;
  openFromBoard(item: DraftItem): void;
  wizardStep: WritableSignal<WizardStep | null>;
  wizardError: WritableSignal<string | null>;
  wizardScheduleAt: WritableSignal<string>;
  wizardTargets: Signal<PostTarget[]>;
  qualityFindings: Signal<QualityFinding[]>;
  aiFindings: WritableSignal<ProofreadingFinding[]>;
  aiProofreading: WritableSignal<boolean>;
  aiProofreadComplete: WritableSignal<boolean>;
  proofreadingRequest: Signal<ProofreadingRequestPreview | null>;
  previewHtml: Signal<string[]>;
  cwOpen: WritableSignal<boolean>;
  spoilerText: WritableSignal<string>;
  sensitive: WritableSignal<boolean>;
  media: WritableSignal<DraftMedia[]>;
  pollOpen: WritableSignal<boolean>;
  pollOptions: WritableSignal<string[]>;
  postLanguage: WritableSignal<string>;
  wizardForward(): void;
  wizardBack(): void;
  wizardCancel(): void;
  setWizardTarget(target: PostTarget): void;
  setWizardScheduleAt(at: string): void;
  newDraft(): void;
  open(item: DraftItem): void;
  save(): void;
  publish(): void;
  setSplitMode(mode: SplitMode): void;
  enterZen(): void;
  exitZen(): void;
  onZenKeydown(event: KeyboardEvent): void;
  discardAndContinue(): void;
  saveAndContinue(): void;
  cancelSwitch(): void;
  onBodyInput(value: string): void;
  toggleCw(): void;
  setSpoilerText(value: string): void;
  toggleSensitive(): void;
  togglePoll(): void;
  setPollOption(index: number, value: string): void;
  setPostLanguage(code: string): void;
  useSuggestedTags(tags: string[]): void;
  useTranslation(result: TranslateResult): void;
  insertEmoji(value: string): void;
  rememberEditorSelection(event: Event): void;
  onPaste(event: ClipboardEvent): void;
  targetUnsupportedReason(target: PostTarget): string | null;
  confirmAiProofreader(): Promise<void>;
  proofreadConsentOpen: WritableSignal<boolean>;
  toggleProofreadConsent(): void;
  altTextNote: Signal<string | null>;
  altTextMissing: Signal<boolean>;
  boxed: Signal<boolean>;
  boxes: Signal<string[]>;
  setBoxText(index: number, value: string): void;
  addBox(): void;
  removeBox(index: number): void;
  renderedPreview: WritableSignal<boolean>;
  longLinks: Signal<{ url: string; start: number; end: number }[]>;
  shortenLinks(): Promise<void>;
  wizardFinish(): Promise<void>;
  visibility: Signal<string>;
  visibilityLockReason: Signal<string | null>;
  setVisibility(value: string): void;
}

function internals(fixture: ComponentFixture<WritePage>): PageInternals {
  return fixture.componentInstance as unknown as PageInternals;
}

const ACCOUNT_ID = 'me-1';
const SCHEDULED_URL = '/api/v1/scheduled_statuses';

function selfStatus(id: string, content: string): Status {
  return {
    id,
    created_at: new Date().toISOString(),
    content: `<p>${content}</p>`,
    spoiler_text: '',
    visibility: 'direct',
    account: { id: ACCOUNT_ID, username: 'me', acct: 'me' } as Account,
    reblog: null,
    mentions: [],
    media_attachments: [],
    poll: null,
  } as unknown as Status;
}

function parked(id: string): ScheduledStatus {
  return {
    id,
    scheduled_at: '2124-01-01T00:00:00Z',
    params: { text: `parked ${id}` },
    media_attachments: [],
  } as unknown as ScheduledStatus;
}

describe('WritePage', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    // HumanTimePipe is impure and reads the wall clock during change detection;
    // pin time so a second boundary can't move under an assertion.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T12:00:00Z'));
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'home', children: [] },
          { path: 'drafts', children: [] },
        ]),
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function signIn(): void {
    const auth = TestBed.inject(Auth);
    auth.mode.set('mastodon');
    auth.account.set({ id: ACCOUNT_ID, username: 'me', acct: 'me' } as Account);
  }

  function setUp(): ComponentFixture<WritePage> {
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(WritePage);
    fixture.detectChanges();
    return fixture;
  }

  /**
   * Answer every scan of the account's own statuses with the same rows.
   *
   * Two services read that endpoint on this page — `DraftSources` looking for
   * post-to-self drafts, `PkmSource` looking for tagged notes — so `expectOne`
   * is wrong here by construction.
   */
  function flushStatusScans(rows: Status[]): void {
    for (const request of httpMock.match((r) => r.url.includes('/statuses'))) {
      request.flush(rows);
    }
  }

  /**
   * Publish, then click through every wizard step to the end.
   *
   * `publish()` opens the wizard rather than handing off directly, so anything
   * asserting on what reaches the composer has to walk it.
   */
  function runWizardToEnd(fixture: ComponentFixture<WritePage>): void {
    const page = internals(fixture);
    page.publish();
    // Bounded rather than `while`, so a bug in the step machine fails the test
    // instead of hanging the run.
    for (let i = 0; i < WIZARD_STEPS.length && page.wizardStep(); i++) {
      page.wizardForward();
    }
  }

  function saveLocal(segments: string[]): string {
    return TestBed.inject(Drafts).save({
      segments,
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    }).id;
  }

  // ------------------------------------------------------------------ loading

  it('issues no requests for an anonymous visitor and still shows local drafts', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    saveLocal(['written while logged out']);
    const page = internals(setUp());

    httpMock.verify();
    expect(page.sources.items().map((i) => i.kind)).toEqual(['local']);
  });

  it('continues a local draft in place — the same draft, not a copy', () => {
    saveLocal(['the original text']);
    const fixture = setUp();
    const page = internals(fixture);

    page.open(page.sources.items()[0]);
    expect(page.body()).toBe('the original text');

    page.onBodyInput('edited text');
    page.save();

    const drafts = TestBed.inject(Drafts);
    expect(drafts.drafts()).toHaveLength(1);
    expect(drafts.drafts()[0].segments).toEqual(['edited text']);
  });

  it('opens a self-post as a copy and leaves the original where it is', () => {
    signIn();
    const fixture = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    // DraftSources and PkmSource both scan the account's own statuses.
    flushStatusScans([selfStatus('s1', 'a private note')]);
    fixture.detectChanges();

    const page = internals(fixture);
    const item = page.sources.items().find((i) => i.kind === 'self')!;
    page.open(item);
    expect(page.body()).toBe('a private note');
    // Nothing saved yet: this is a copy in progress with no home of its own.
    expect(TestBed.inject(Drafts).drafts()).toHaveLength(0);

    page.save();
    // Now it is a local draft — and the self-post is untouched.
    expect(TestBed.inject(Drafts).drafts()).toHaveLength(1);
    expect(page.sources.items().some((i) => i.kind === 'self' && i.id === 's1')).toBe(true);
  });

  it('opens a parked post as a copy and leaves the original parked', () => {
    signIn();
    const fixture = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([parked('p1')]);
    flushStatusScans([]);
    fixture.detectChanges();

    const page = internals(fixture);
    page.open(page.sources.items().find((i) => i.kind === 'scheduled')!);
    page.save();

    expect(page.sources.items().some((i) => i.kind === 'scheduled' && i.id === 'p1')).toBe(true);
  });

  it('opens a paste as a copy and leaves the paste record alone', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    TestBed.inject(PasteHistory).add(
      'rentry',
      'Rentry',
      {
        title: 'pasted',
        content: 'paste body',
        language: 'plaintext',
        expiry: '1w',
        visibility: 'unlisted',
      },
      { slug: 'abc', url: 'u', rawUrl: 'r', editKey: 'k' },
    );
    const page = internals(setUp());

    page.open(page.sources.items().find((i) => i.kind === 'paste')!);
    expect(page.body()).toBe('paste body');
    page.save();

    expect(TestBed.inject(PasteHistory).records()).toHaveLength(1);
  });

  it('reopens a thread with its boundaries visible rather than collapsed', () => {
    saveLocal(['one', 'two', 'three']);
    const page = internals(setUp());

    page.open(page.sources.items()[0]);
    expect(page.body()).toBe('one\n\n---\n\ntwo\n\n---\n\nthree');
    expect(page.segments().map((s) => s.text)).toEqual(['one', 'two', 'three']);
  });

  // ------------------------------------------------------------------- saving

  it('saving twice updates one draft rather than piling up copies', () => {
    const page = internals(setUp());
    page.newDraft();

    page.onBodyInput('first');
    page.save();
    page.onBodyInput('second');
    page.save();

    const drafts = TestBed.inject(Drafts).drafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].segments).toEqual(['second']);
  });

  it('saves a fresh copy when the draft was deleted underneath it', () => {
    const id = saveLocal(['held open here']);
    const fixture = setUp();
    const page = internals(fixture);
    page.open(page.sources.items()[0]);

    // Deleted in another tab, or from /drafts.
    TestBed.inject(Drafts).remove(id);
    page.onBodyInput('edited after the delete');
    page.save();

    const drafts = TestBed.inject(Drafts).drafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].segments).toEqual(['edited after the delete']);
    expect(page.notice()?.key).toBe('pages.write.saved.replacedDeleted');
  });

  it('splits on --- when saving', () => {
    const page = internals(setUp());
    page.newDraft();
    page.onBodyInput('one\n---\ntwo');
    page.save();

    expect(TestBed.inject(Drafts).drafts()[0].segments).toEqual(['one', 'two']);
  });

  it('saves the whole body as one segment in demand mode', () => {
    const page = internals(setUp());
    page.newDraft();
    page.setSplitMode('demand');
    page.onBodyInput('one\n---\ntwo');
    page.save();

    expect(TestBed.inject(Drafts).drafts()[0].segments).toEqual(['one\n---\ntwo']);
  });

  it('carries the split mode across when a copy becomes a real draft', () => {
    const page = internals(setUp());
    page.newDraft();
    page.setSplitMode('auto');
    page.onBodyInput('some prose');
    page.save();

    const id = TestBed.inject(Drafts).drafts()[0].id;
    expect(TestBed.inject(WriteWorkspace).splitMode(`local:${id}`)).toBe('auto');
  });

  it('does not save an empty body', () => {
    const page = internals(setUp());
    page.newDraft();
    page.onBodyInput('   ');
    page.save();

    expect(TestBed.inject(Drafts).drafts()).toHaveLength(0);
  });

  // ------------------------------------------------------- unsaved-work guard

  it('holds up a switch while there is unsaved writing', () => {
    saveLocal(['a saved draft']);
    const fixture = setUp();
    const page = internals(fixture);

    page.newDraft();
    page.onBodyInput('unsaved work');
    page.open(page.sources.items()[0]);

    // The switch has not happened: the editor still holds the unsaved body.
    expect(page.pendingSwitch()).not.toBeNull();
    expect(page.body()).toBe('unsaved work');
  });

  it('saves and continues, keeping both the old and the new draft', () => {
    saveLocal(['a saved draft']);
    const fixture = setUp();
    const page = internals(fixture);

    page.newDraft();
    page.onBodyInput('unsaved work');
    page.open(page.sources.items().find((i) => i.preview === 'a saved draft')!);
    page.saveAndContinue();

    expect(
      TestBed.inject(Drafts)
        .drafts()
        .map((d) => d.segments[0]),
    ).toContain('unsaved work');
    expect(page.body()).toBe('a saved draft');
  });

  it('does not let Save and continue silently discard transient attachments', () => {
    saveLocal(['a saved draft']);
    const page = internals(setUp());
    page.newDraft();
    page.onBodyInput('unsaved work with an image');
    page.onPaste({
      clipboardData: { files: [new File(['png'], 'shot.png', { type: 'image/png' })] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent);
    page.open(page.sources.items().find((item) => item.preview === 'a saved draft')!);

    page.saveAndContinue();

    expect(page.pendingSwitch()).not.toBeNull();
    expect(page.body()).toBe('unsaved work with an image');
    expect(page.media()).toHaveLength(1);
  });

  it('discards and continues, keeping nothing', () => {
    saveLocal(['a saved draft']);
    const fixture = setUp();
    const page = internals(fixture);

    page.newDraft();
    page.onBodyInput('unsaved work');
    page.open(page.sources.items()[0]);
    page.discardAndContinue();

    expect(TestBed.inject(Drafts).drafts()).toHaveLength(1);
    expect(page.body()).toBe('a saved draft');
  });

  it('cancelling the guard leaves the unsaved body exactly where it was', () => {
    saveLocal(['a saved draft']);
    const fixture = setUp();
    const page = internals(fixture);

    page.newDraft();
    page.onBodyInput('unsaved work');
    page.open(page.sources.items()[0]);
    page.cancelSwitch();

    expect(page.pendingSwitch()).toBeNull();
    expect(page.body()).toBe('unsaved work');
    expect(page.dirty()).toBe(true);
  });

  it('does not hold up a switch when the saved body is unchanged', () => {
    saveLocal(['a saved draft']);
    const fixture = setUp();
    const page = internals(fixture);

    page.newDraft();
    page.onBodyInput('written and saved');
    page.save();
    page.open(page.sources.items().find((i) => i.preview === 'a saved draft')!);

    expect(page.pendingSwitch()).toBeNull();
    expect(page.body()).toBe('a saved draft');
  });

  // --------------------------------------------------------------------- zen

  it('enters and leaves writing zen', () => {
    const fixture = setUp();
    const page = internals(fixture);
    const zen = TestBed.inject(WritingZen);

    page.enterZen();
    expect(zen.active()).toBe(true);
    page.exitZen();
    expect(zen.active()).toBe(false);
  });

  it('leaves writing zen on Escape', () => {
    const fixture = setUp();
    const page = internals(fixture);
    page.enterZen();

    page.onZenKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(TestBed.inject(WritingZen).active()).toBe(false);
  });

  it('ignores other keys in zen', () => {
    const fixture = setUp();
    const page = internals(fixture);
    page.enterZen();

    page.onZenKeydown(new KeyboardEvent('keydown', { key: 'a' }));
    expect(TestBed.inject(WritingZen).active()).toBe(true);
  });

  it('resets zen when the page is destroyed, so it cannot leak to another route', () => {
    const fixture = setUp();
    internals(fixture).enterZen();

    fixture.destroy();
    expect(TestBed.inject(WritingZen).active()).toBe(false);
  });

  it('shows the editor and the zen box for the same body', () => {
    const fixture = setUp();
    const page = internals(fixture);
    page.newDraft();
    page.onBodyInput('written in the editor');
    fixture.detectChanges();

    // The editor is what's on screen before zen.
    expect(fixture.nativeElement.querySelector('.editor-box')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.zen-box')).toBeNull();

    page.enterZen();
    fixture.detectChanges();

    // In zen there is the text, and nothing else: no panes, no draft list, no
    // notes. Both surfaces read the same body signal, so the text carries over.
    expect(fixture.nativeElement.querySelector('.zen-box')).toBeTruthy();
    expect(page.body()).toBe('written in the editor');
    expect(fixture.nativeElement.querySelector('.panes')).toBeNull();
    expect(fixture.nativeElement.querySelector('.pane-left')).toBeNull();
    expect(fixture.nativeElement.querySelector('.pane-right')).toBeNull();
    // The way out stays visible.
    const labels = [...fixture.nativeElement.querySelectorAll('.zen-bar button')].map(
      (b: Element) => b.textContent?.trim(),
    );
    expect(labels).toContain('Leave zen mode');
  });

  // ---------------------------------------------------------------- publishing

  it('publishes Bluesky in Write despite a language selection, without a composer handoff', async () => {
    const fixture = setUp();
    const page = internals(fixture);
    page.newDraft();
    page.onBodyInput('ready for Bluesky');
    page.setWizardTarget('bsky');
    page.postLanguage.set('en');
    expect(page.targetUnsupportedReason('bsky')).toBeNull();
    const publish = vi
      .spyOn(fixture.debugElement.injector.get(BlueskyPublication), 'publish')
      .mockResolvedValue();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    await page.wizardFinish();
    expect(publish).toHaveBeenCalledWith(['ready for Bluesky'], []);
    expect(navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(Drafts).takeHandoff()).toBeNull();
    expect(page.body()).toBe('');
  });

  it('keeps all four segments in Write when segment two is oversized', async () => {
    const fixture = setUp();
    const page = internals(fixture);
    page.newDraft();
    page.onBodyInput(['one', 'x'.repeat(301), 'three', 'four'].join('\n---\n'));
    page.setWizardTarget('bsky');
    const publish = vi.spyOn(fixture.debugElement.injector.get(BlueskyPublication), 'publish');
    await page.wizardFinish();
    expect(page.wizardError()).toContain('post 2 of 4');
    expect(publish).not.toHaveBeenCalled();
    expect(page.body()).toContain('four');
    expect(TestBed.inject(Drafts).takeHandoff()).toBeNull();
  });

  it('keeps the draft and wizard error in place when Bluesky fails', async () => {
    const fixture = setUp();
    const page = internals(fixture);
    page.newDraft();
    page.onBodyInput('keep this');
    page.setWizardTarget('bsky');
    vi.spyOn(fixture.debugElement.injector.get(BlueskyPublication), 'publish').mockRejectedValue(
      new Error('post two failed'),
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    await page.wizardFinish();
    expect(page.body()).toBe('keep this');
    expect(page.wizardError()).toBe('post two failed');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('hands the text to the composer rather than posting from here', () => {
    signIn();
    const fixture = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    flushStatusScans([]);
    const page = internals(fixture);
    page.newDraft();
    page.onBodyInput('ready to go\n---\nsecond post');
    runWizardToEnd(fixture);

    const handoff = TestBed.inject(Drafts).takeHandoff();
    expect(handoff?.snapshot.segments).toEqual(['ready to go', 'second post']);
    expect(handoff?.publishImmediately).toBe(true);
    // The existing composer owns provider-specific publishing; the writing
    // page marks the handoff for immediate send after the target-last review.
    expect(httpMock.match((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('publishing is not held up by the unsaved-work guard', () => {
    // Handing the text to the composer is the opposite of throwing it away, so
    // prompting "you have unsaved writing" on the way there would be nonsense.
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    const page = internals(fixture);
    page.newDraft();
    page.onBodyInput('never saved, straight to publish');
    runWizardToEnd(fixture);

    expect(page.pendingSwitch()).toBeNull();
    expect(TestBed.inject(Drafts).takeHandoff()?.snapshot.segments).toEqual([
      'never saved, straight to publish',
    ]);
  });

  // ------------------------------------------------------------------ sidecar

  it('prunes sidecar entries for drafts that no longer exist', () => {
    // Anonymous, so the sources settle synchronously and the pruning effect has
    // a loaded list to work from.
    TestBed.inject(Auth).mode.set('anonymous');
    const workspace = TestBed.inject(WriteWorkspace);
    workspace.setSplitMode('local:long-gone', 'auto');
    const id = saveLocal(['still here']);
    workspace.setSplitMode(`local:${id}`, 'demand');

    const fixture = setUp();
    fixture.detectChanges();

    expect(workspace.splitMode('local:long-gone')).toBe('rule');
    // The draft that still exists keeps its mode.
    expect(workspace.splitMode(`local:${id}`)).toBe('demand');
  });

  // -------------------------------------------------------------------- notes

  it('jotting a note saves a new draft and leaves the open one alone', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const page = internals(setUp());
    page.newDraft();
    page.onBodyInput('the piece I am in the middle of');

    page.jotText.set('remember the milk');
    page.jot();

    // The note was saved...
    const drafts = TestBed.inject(Drafts).drafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].segments[0]).toBe('remember the milk #note');
    // ...and the editor is exactly where it was.
    expect(page.body()).toBe('the piece I am in the middle of');
    expect(page.pendingSwitch()).toBeNull();
    expect(page.jotText()).toBe('');
  });

  it('a jotted note opens as one post, not split on a stray dash', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const page = internals(setUp());
    page.jotText.set('a note --- with a dash');
    page.jot();

    const id = TestBed.inject(Drafts).drafts()[0].id;
    expect(TestBed.inject(WriteWorkspace).splitMode(`local:${id}`)).toBe('demand');
  });

  it('jots the kind the user picked, in their own word', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    TestBed.inject(ClientPrefs).setPkmVocabulary({ note: ['notiz'], todo: ['aufgabe'], cal: [] });
    const page = internals(setUp());

    page.jotKind.set('todo');
    page.jotText.set('etwas erledigen');
    page.jot();

    expect(TestBed.inject(Drafts).drafts()[0].segments[0]).toBe('etwas erledigen #aufgabe');
  });

  it('does not jot an empty note', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const page = internals(setUp());
    page.jotText.set('   ');
    page.jot();

    expect(TestBed.inject(Drafts).drafts()).toHaveLength(0);
  });

  it('shows tagged drafts in the notes list and filters by kind', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    saveLocal(['a plain draft']);
    saveLocal(['reply to this #todo']);
    saveLocal(['keep this #note']);
    const page = internals(setUp());

    expect(page.pkmVisible()).toHaveLength(2);
    page.setPkmFilter('todo');
    expect(page.pkmVisible().map((i) => i.preview)).toEqual(['reply to this #todo']);
  });

  it('opening a local note continues it in place', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    saveLocal(['keep this #note']);
    const page = internals(setUp());

    page.openNote(page.pkmVisible()[0]);
    page.onBodyInput('keep this, edited #note');
    page.save();

    expect(TestBed.inject(Drafts).drafts()).toHaveLength(1);
  });

  it('opening a self-post note takes a copy and leaves the post alone', () => {
    signIn();
    const fixture = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    flushStatusScans([selfStatus('s1', 'a tagged private note #note')]);
    fixture.detectChanges();

    const page = internals(fixture);
    const note = page.pkmVisible().find((i) => i.source.kind === 'self')!;
    page.openNote(note);
    expect(page.body()).toBe('a tagged private note #note');
    // A copy: nothing saved, and the original is still listed.
    expect(TestBed.inject(Drafts).drafts()).toHaveLength(0);
    expect(page.pkmVisible().some((i) => i.id === 's1')).toBe(true);
  });

  it('hides the notes pane in writing zen', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    saveLocal(['keep this #note']);
    const fixture = setUp();
    const page = internals(fixture);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pane-right')).toBeTruthy();

    page.enterZen();
    fixture.detectChanges();

    // The whole point of writing zen: your own notes are a distraction too.
    expect(fixture.nativeElement.querySelector('.pane-right')).toBeNull();
    expect(fixture.nativeElement.querySelector('.jot')).toBeNull();
  });

  it('keeps the editor body when switching to the notes tab and back', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    const page = internals(fixture);
    page.newDraft();
    page.onBodyInput('half a paragraph');

    page.tab.set('notes');
    fixture.detectChanges();
    page.tab.set('write');
    fixture.detectChanges();

    expect(page.body()).toBe('half a paragraph');
  });

  // ------------------------------------------------------------- authoring tools

  it('saves and restores CW, poll, sensitive, and post-language state', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    const page = internals(fixture);
    page.newDraft();
    page.onBodyInput('A multilingual question');
    page.toggleCw();
    page.setSpoilerText('Spoilers');
    page.togglePoll();
    page.setPollOption(0, 'Yes');
    page.setPollOption(1, 'No');
    page.setPostLanguage('eo');
    page.sensitive.set(true);
    page.save();

    const saved = TestBed.inject(Drafts).drafts()[0];
    expect(saved).toMatchObject({
      spoilerText: 'Spoilers',
      sensitive: true,
      postLanguage: 'eo',
      poll: { options: ['Yes', 'No'], multiple: false, expiresIn: 86400 },
    });

    page.newDraft();
    page.open(page.sources.items().find((item) => item.id === saved.id)!);
    expect(page.cwOpen()).toBe(true);
    expect(page.spoilerText()).toBe('Spoilers');
    expect(page.pollOptions()).toEqual(['Yes', 'No']);
    expect(page.postLanguage()).toBe('eo');
  });

  it('attaches pasted images but leaves an ordinary text paste alone', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const page = internals(setUp());
    page.newDraft();
    const imagePrevented = vi.fn();
    page.onPaste({
      clipboardData: { files: [new File(['png'], 'shot.png', { type: 'image/png' })] },
      preventDefault: imagePrevented,
    } as unknown as ClipboardEvent);

    expect(imagePrevented).toHaveBeenCalled();
    expect(page.media()).toHaveLength(1);
    expect(page.media()[0].file?.name).toBe('shot.png');

    const textPrevented = vi.fn();
    page.onPaste({
      clipboardData: { files: [] },
      preventDefault: textPrevented,
    } as unknown as ClipboardEvent);
    expect(textPrevented).not.toHaveBeenCalled();
  });

  it('keeps media and polls mutually exclusive and marks attached media sensitive', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const page = internals(setUp());
    page.newDraft();
    page.onPaste({
      clipboardData: { files: [new File(['png'], 'shot.png', { type: 'image/png' })] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent);

    page.togglePoll();
    expect(page.pollOpen()).toBe(false);
    page.toggleSensitive();
    expect(page.sensitive()).toBe(true);
  });

  it('inserts emoji at the caret and appends only new suggested hashtags', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    const page = internals(fixture);
    page.newDraft();
    page.onBodyInput('Hi #Cats');
    fixture.detectChanges();
    page.rememberEditorSelection({
      target: { selectionStart: 2, selectionEnd: 2 },
    } as unknown as Event);

    page.insertEmoji('🙂');
    expect(page.body()).toBe('Hi🙂 #Cats');
    page.useSuggestedTags(['cats', 'NaturePhotography']);
    expect(page.body()).toBe('Hi🙂 #Cats #NaturePhotography');
  });

  it('sets language on replacement translation but not on appended bilingual text', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const page = internals(setUp());
    page.newDraft();
    page.onBodyInput('Hello');
    page.useTranslation({ text: 'Saluton', mode: 'replace', code: 'eo' });
    expect(page.body()).toBe('Saluton');
    expect(page.postLanguage()).toBe('eo');

    page.useTranslation({ text: 'Hello', mode: 'append', code: 'en' });
    expect(page.body()).toBe('Saluton\n\nHello');
    expect(page.postLanguage()).toBe('eo');
  });

  it('previews the billable AI request and waits for confirmation before sending it', async () => {
    const run = vi.fn();
    const preview = vi.fn(() => ({
      connector: 'OpenRouter' as const,
      model: 'test/proofreader',
      prompt: 'Exact proofread prompt\nThis is is repeated.',
    }));
    TestBed.overrideProvider(AiAvailability, { useValue: { enabled: signal(true) } });
    TestBed.overrideProvider(OpenRouterSession, { useValue: { connected: signal(true) } });
    TestBed.overrideProvider(Proofreader, { useValue: { preview, run } });
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    const page = internals(fixture);
    run.mockImplementation(async () => {
      expect(page.qualityFindings().map((finding) => finding.id)).toContain('repeated-words');
      return [{ message: 'The word “is” is repeated.' }];
    });
    page.newDraft();
    page.onBodyInput('This is is repeated.');
    // No wizard: the proofreader now lives beside the editor, so the text is
    // still editable while the findings are on screen.
    fixture.detectChanges();

    expect(run).not.toHaveBeenCalled();
    expect(page.proofreadingRequest()).toEqual({
      connector: 'OpenRouter',
      model: 'test/proofreader',
      prompt: 'Exact proofread prompt\nThis is is repeated.',
    });
    // The offer is visible; the prompt itself is disclosed on request.
    expect(fixture.nativeElement.textContent).toContain('Proofread with AI');
    expect(fixture.nativeElement.textContent).not.toContain('Exact proofread prompt');

    page.toggleProofreadConsent();
    fixture.detectChanges();
    expect(run).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('test/proofreader');
    expect(fixture.nativeElement.textContent).toContain('Exact proofread prompt');
    expect(fixture.nativeElement.textContent).toContain('may use paid credits');

    await page.confirmAiProofreader();

    expect(run).toHaveBeenCalledWith('This is is repeated.');
    expect(page.aiFindings()).toEqual([{ message: 'The word “is” is repeated.' }]);
    expect(page.aiProofreadComplete()).toBe(true);
    expect(page.body()).toBe('This is is repeated.');
  });

  it('does not call the AI proofreader without an enabled OpenRouter connection', async () => {
    const run = vi.fn();
    TestBed.overrideProvider(Proofreader, { useValue: { run } });
    TestBed.inject(Auth).mode.set('anonymous');
    const page = internals(setUp());
    page.newDraft();
    page.onBodyInput('No model call for this.');
    page.publish();

    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
    expect(page.aiFindings()).toEqual([]);
  });

  // ------------------------------------------------------------ publish wizard

  /** Open the wizard with a body ready to go. */
  function openWizard(fixture: ComponentFixture<WritePage>, body = 'ready to publish'): void {
    const page = internals(fixture);
    page.newDraft();
    page.onBodyInput(body);
    page.publish();
  }

  it('opens on the first step instead of publishing immediately', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    openWizard(fixture);

    // An obvious one-line singleton skips split preview and starts on checks.
    expect(internals(fixture).wizardStep()).toBe('quality');
    // Nothing handed over yet.
    expect(TestBed.inject(Drafts).takeHandoff()).toBeNull();
  });

  it('walks forward through the steps and publishes at the end', () => {
    signIn();
    const fixture = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    flushStatusScans([]);
    const page = internals(fixture);
    openWizard(fixture, 'the finished piece');

    page.wizardForward();
    expect(page.wizardStep()).toBe('targets');
    page.setWizardTarget('fedi');
    page.wizardForward();
    expect(page.wizardStep()).toBe('when');
    page.wizardForward();

    expect(page.wizardStep()).toBeNull();
    expect(TestBed.inject(Drafts).takeHandoff()?.snapshot.segments).toEqual(['the finished piece']);
  });

  it('publishes immediately when every step is switched off', () => {
    // Someone who turned the whole wizard off must not get an empty dialog.
    TestBed.inject(Auth).mode.set('anonymous');
    TestBed.inject(ClientPrefs).wizardSteps.set({
      targets: false,
      preview: false,
      quality: false,
      when: false,
    });
    const fixture = setUp();
    openWizard(fixture, 'straight out');

    expect(internals(fixture).wizardStep()).toBeNull();
    expect(TestBed.inject(Drafts).takeHandoff()?.snapshot.segments).toEqual(['straight out']);
  });

  it('still asks for the destination when attachments require target-specific preparation', () => {
    signIn();
    const fixture = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    flushStatusScans([]);
    TestBed.inject(ClientPrefs).wizardSteps.set({
      targets: false,
      preview: false,
      quality: false,
      when: false,
    });
    const page = internals(fixture);
    page.newDraft();
    page.onBodyInput('an attached image');
    page.onPaste({
      clipboardData: { files: [new File(['png'], 'shot.png', { type: 'image/png' })] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent);

    page.publish();

    expect(page.wizardStep()).toBe('targets');
    expect(TestBed.inject(Drafts).takeHandoff()).toBeNull();
  });

  it('skips a disabled step in both directions', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    TestBed.inject(ClientPrefs).setWizardStep('preview', false);
    const fixture = setUp();
    const page = internals(fixture);
    openWizard(fixture);

    page.wizardForward();
    expect(page.wizardStep()).toBe('targets');
    page.wizardBack();
    // Not a hidden preview step that would render nothing.
    expect(page.wizardStep()).toBe('quality');
  });

  it('cancel publishes nothing and leaves the body alone', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    const page = internals(fixture);
    openWizard(fixture, 'not going out after all');
    page.wizardForward();
    page.wizardCancel();

    expect(page.wizardStep()).toBeNull();
    expect(page.body()).toBe('not going out after all');
    expect(TestBed.inject(Drafts).takeHandoff()).toBeNull();
    expect(httpMock.match((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('does not open for an empty body', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    const page = internals(fixture);
    page.newDraft();
    page.onBodyInput('   ');
    page.publish();

    expect(page.wizardStep()).toBeNull();
  });

  it('offers no target the composer would refuse', () => {
    // Anonymous: no Mastodon token, so fedi and "both" are not on offer.
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    openWizard(fixture);

    const targets = internals(fixture).wizardTargets();
    expect(targets).not.toContain('fedi');
    expect(targets).not.toContain('both');
    expect(targets).toContain('paste');
  });

  it('offers the fedi target once signed in', () => {
    signIn();
    const fixture = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    flushStatusScans([]);
    openWizard(fixture);

    expect(internals(fixture).wizardTargets()).toContain('fedi');
  });

  it('uploads local media only after Mastodon is chosen as the final target', async () => {
    signIn();
    const fixture = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    flushStatusScans([]);
    const page = internals(fixture);
    page.newDraft();
    page.onBodyInput('A picture');
    page.onPaste({
      clipboardData: { files: [new File(['png'], 'shot.png', { type: 'image/png' })] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent);
    page.publish();
    page.wizardForward();
    expect(page.wizardStep()).toBe('targets');

    page.setWizardTarget('fedi');
    page.wizardForward();
    expect(page.wizardStep()).toBe('when');
    expect(httpMock.match('/api/v2/media')).toHaveLength(0);
    page.wizardForward();
    const upload = httpMock.expectOne('/api/v2/media');
    upload.flush({
      id: 'media-1',
      type: 'image',
      url: 'https://example.com/full.png',
      preview_url: 'https://example.com/preview.png',
      description: null,
    });

    const drafts = TestBed.inject(Drafts);
    await vi.waitFor(() => expect(drafts.hasHandoff()).toBe(true));
    expect(drafts.takeHandoff()?.media?.[0].media.id).toBe('media-1');
  });

  it('carries the chosen target into the handoff', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    const page = internals(fixture);
    openWizard(fixture);
    page.wizardForward();
    expect(page.wizardStep()).toBe('targets');
    page.setWizardTarget('paste');
    page.wizardForward();

    expect(TestBed.inject(Drafts).takeHandoff()?.snapshot.target).toBe('paste');
  });

  it('previews the same splits the editor shows', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    const page = internals(fixture);
    openWizard(fixture, 'one\n---\ntwo');

    expect(page.segments().map((s) => s.text)).toEqual(['one', 'two']);
    expect(page.previewHtml()).toHaveLength(2);
  });

  it('escapes markup in the preview rather than rendering it', () => {
    // The body is whatever the user typed and it reaches the preview through
    // [innerHTML]. Elsewhere in this app that binding is only safe because the
    // *server* sanitized the HTML first (see status-card.html); here nobody has,
    // so the escaping is what makes it safe.
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    const page = internals(fixture);
    openWizard(fixture, '<img src=x onerror=alert(1)>');

    expect(page.previewHtml()[0]).not.toContain('<img');
    expect(page.previewHtml()[0]).toContain('&lt;img');
  });

  it('renders the escaped preview as visible text in the DOM', () => {
    // The end-to-end half: what actually lands on the page is a text node, not
    // an element the browser would act on.
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    const page = internals(fixture);
    openWizard(fixture, '<script>alert(1)</script>');
    page.wizardStep.set('preview');
    fixture.detectChanges();

    const preview = fixture.nativeElement.querySelector('.preview-body') as HTMLElement;
    expect(preview.querySelector('script')).toBeNull();
    expect(preview.querySelector('img')).toBeNull();
    expect(preview.textContent).toContain('<script>');
  });

  it('still renders ordinary markdown emphasis in the preview', () => {
    // Escaping must not have cost the feature its actual job.
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    const page = internals(fixture);
    openWizard(fixture, 'a **bold** claim');

    expect(page.previewHtml()[0]).toContain('<strong>bold</strong>');
  });

  it('surfaces quality findings without blocking the step', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    const page = internals(fixture);
    openWizard(fixture, 'a tagged thought #todo');

    expect(page.qualityFindings().map((f) => f.id)).toContain('pkm-tagged');
    // Advisory only: the step still moves on.
    page.wizardStep.set('quality');
    page.wizardForward();
    expect(page.wizardStep()).toBe('targets');
  });

  it('publishes non-Mastodon targets without offering a browser-based schedule', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    const page = internals(fixture);
    openWizard(fixture, 'publish this as a paste');

    page.wizardForward();
    expect(page.wizardStep()).toBe('targets');
    page.setWizardTarget('paste');
    page.wizardForward();

    expect(page.wizardStep()).toBeNull();
    expect(TestBed.inject(Drafts).takeHandoff()?.snapshot.target).toBe('paste');
  });

  it('drops a Mastodon schedule when the destination changes', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const page = internals(setUp());
    page.setWizardScheduleAt('2027-01-01T09:00');

    page.setWizardTarget('paste');

    expect(page.wizardScheduleAt()).toBe('');
  });

  it('requires a destination choice before an enabled scheduling step', () => {
    signIn();
    TestBed.inject(ClientPrefs).setWizardStep('targets', false);
    const fixture = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    flushStatusScans([]);
    const page = internals(fixture);
    openWizard(fixture, 'schedule this on Mastodon');

    page.wizardForward();
    expect(page.wizardStep()).toBe('targets');
    page.setWizardTarget('fedi');
    page.wizardForward();
    expect(page.wizardStep()).toBe('when');
  });

  it('schedules from the last step instead of handing off', () => {
    signIn();
    const fixture = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    flushStatusScans([]);
    const page = internals(fixture);
    openWizard(fixture, 'later, please');

    page.wizardForward();
    expect(page.wizardStep()).toBe('targets');
    page.setWizardTarget('fedi');
    page.wizardForward();
    expect(page.wizardStep()).toBe('when');
    page.setWizardScheduleAt('2027-01-01T09:00');
    page.wizardForward();

    const handoff = TestBed.inject(Drafts).takeHandoff();
    expect(handoff?.scheduleAt).toBe('2027-01-01T09:00');
    expect(handoff?.publishImmediately).toBe(true);
    expect(page.wizardStep()).toBeNull();
    httpMock.match(() => true);
  });

  it('keeps the body when a scheduled date is refused', () => {
    signIn();
    const fixture = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    flushStatusScans([]);
    const page = internals(fixture);
    openWizard(fixture, 'refused, but not lost');

    page.wizardForward();
    page.setWizardTarget('fedi');
    page.wizardForward();
    expect(page.wizardStep()).toBe('when');
    page.setWizardScheduleAt('not-a-date');
    page.wizardForward();

    expect(page.wizardError()).toContain('could not be read');
    expect(page.body()).toBe('refused, but not lost');
    expect(page.wizardStep()).toBe('when');
  });

  // -------------------------------------------------------------- board panel

  it('opens and closes the board without touching the editor body', () => {
    // The property most likely to break here: an overlay panel must not tear
    // down and recreate the editor underneath it.
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    const page = internals(fixture);
    page.newDraft();
    page.onBodyInput('half a paragraph, mid-thought');
    fixture.detectChanges();

    page.openBoard();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-write-board')).toBeTruthy();

    page.closeBoard();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-write-board')).toBeNull();
    expect(page.body()).toBe('half a paragraph, mid-thought');
    expect(page.dirty()).toBe(true);
  });

  it('picking a card loads it and gets out of the way', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    saveLocal(['something to pick up again']);
    const fixture = setUp();
    const page = internals(fixture);
    page.openBoard();
    fixture.detectChanges();

    page.openFromBoard(page.sources.items()[0]);
    fixture.detectChanges();

    expect(page.body()).toBe('something to pick up again');
    expect(page.boardOpen()).toBe(false);
    expect(page.tab()).toBe('write');
  });

  it('picking a card from the notes tab returns to the editor', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    saveLocal(['a draft']);
    const fixture = setUp();
    const page = internals(fixture);
    page.tab.set('notes');
    page.openBoard();

    page.openFromBoard(page.sources.items()[0]);

    expect(page.tab()).toBe('write');
  });

  it('the board is closed on arrival', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp();
    expect(internals(fixture).boardOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('app-write-board')).toBeNull();
  });

  it('works anonymously without issuing a request', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    saveLocal(['local only']);
    const fixture = setUp();
    internals(fixture).openBoard();
    fixture.detectChanges();

    httpMock.verify();
    expect(fixture.nativeElement.querySelector('.card-text').textContent.trim()).toBe('local only');
  });

  it('remembers a split mode per draft across reopens', () => {
    saveLocal(['first draft']);
    saveLocal(['second draft']);
    const fixture = setUp();
    const page = internals(fixture);

    const second = page.sources.items().find((i) => i.preview === 'second draft')!;
    page.open(second);
    page.setSplitMode('auto');

    page.open(page.sources.items().find((i) => i.preview === 'first draft')!);
    expect(page.splitMode()).toBe('rule');

    page.open(second);
    expect(page.splitMode()).toBe('auto');
  });

  // -------------------------------------------------------------- visibility

  describe('visibility', () => {
    /** Save a draft at `visibility` and return the row the page lists for it. */
    function savedAt(fixture: ComponentFixture<WritePage>, visibility: string): DraftItem {
      const { id } = TestBed.inject(Drafts).save({
        segments: ['a considered thought'],
        spoilerText: '',
        sensitive: false,
        visibility,
        poll: null,
      });
      fixture.detectChanges();
      const item = internals(fixture)
        .sources.items()
        .find((row) => row.key === `local:${id}`);
      if (!item) {
        throw new Error('the saved draft did not appear in the list');
      }
      return item;
    }

    it('opens a new draft on the account posting default', () => {
      TestBed.inject(ClientPrefs).defaultVisibility.set('private');
      const page = internals(setUp());
      page.newDraft();

      expect(page.visibility()).toBe('private');
    });

    /**
     * The regression this whole picker exists for. The page used to stamp
     * `prefs.defaultVisibility()` into every snapshot and never read the saved
     * value back, so a followers-only draft opened here was published public.
     */
    it('restores a saved visibility instead of the account default', () => {
      TestBed.inject(ClientPrefs).defaultVisibility.set('public');
      const fixture = setUp();
      const page = internals(fixture);
      page.open(savedAt(fixture, 'private'));

      expect(page.visibility()).toBe('private');
    });

    it('round-trips a visibility through open and save', () => {
      TestBed.inject(ClientPrefs).defaultVisibility.set('public');
      const fixture = setUp();
      const page = internals(fixture);
      page.open(savedAt(fixture, 'direct'));
      page.onBodyInput('edited, but still just for them');
      page.save();
      fixture.detectChanges();

      const saved = TestBed.inject(Drafts).drafts();
      expect(saved.length).toBeGreaterThan(0);
      expect(saved.every((draft) => draft.visibility === 'direct')).toBe(true);
    });

    it('carries the chosen visibility into the composer handoff', () => {
      // Signed in, so the fediverse is the first usable target. Anonymously the
      // wizard opens on a paste, which legitimately clamps to public.
      signIn();
      const fixture = setUp();
      flushStatusScans([]);
      const page = internals(fixture);
      page.newDraft();
      page.onBodyInput('followers only, please');
      page.setVisibility('private');
      runWizardToEnd(fixture);

      expect(TestBed.inject(Drafts).takeHandoff()?.snapshot.visibility).toBe('private');
    });

    /**
     * A blog or paste destination cannot express "followers only", so the
     * picker clamps — but the choice must come back when the destination does,
     * rather than leaving the post public because it once passed through a blog.
     */
    it('stashes and restores a visibility across a narrowing target', () => {
      const page = internals(setUp());
      page.newDraft();
      page.setVisibility('private');

      page.setWizardTarget('paste');
      expect(page.visibility()).toBe('public');
      expect(page.visibilityLockReason()).not.toBeNull();

      page.setWizardTarget('fedi');
      expect(page.visibility()).toBe('private');
      expect(page.visibilityLockReason()).toBeNull();
    });

    it('restores the visibility chosen before any narrowing, not the clamped one', () => {
      const page = internals(setUp());
      page.newDraft();
      page.setVisibility('unlisted');
      page.setWizardTarget('paste');
      page.setWizardTarget('bsky');
      page.setWizardTarget('fedi');

      expect(page.visibility()).toBe('unlisted');
    });

    it('ignores picker clicks while a destination has visibility locked', () => {
      const page = internals(setUp());
      page.newDraft();
      page.setWizardTarget('paste');
      page.setVisibility('private');

      expect(page.visibility()).toBe('public');
    });

    /**
     * A widening target change must leave a hand-picked visibility alone. The
     * publish wizard selects a target as it opens, so getting this wrong resets
     * the picker to the posting default at the exact moment it matters.
     */
    it('leaves a hand-picked visibility alone when no clamp is in force', () => {
      TestBed.inject(ClientPrefs).defaultVisibility.set('public');
      const page = internals(setUp());
      page.newDraft();
      page.setVisibility('private');
      page.setWizardTarget('fedi');

      expect(page.visibility()).toBe('private');
    });

    /**
     * The lock and the stash are two halves of one promise: while a narrowing
     * destination is selected the picker cannot be used at all, so the value
     * stashed on the way in is always the value that comes back. A composer
     * that let you "choose" during a clamp would be offering a choice it then
     * discards.
     */
    it('keeps the pre-clamp choice because the picker is inert while clamped', () => {
      const page = internals(setUp());
      page.newDraft();
      page.setVisibility('private');
      page.setWizardTarget('paste');
      page.setVisibility('public');
      page.setWizardTarget('fedi');

      expect(page.visibility()).toBe('private');
    });
  });

  // ------------------------------------------------------------- boxes layout

  describe('a box per post', () => {
    const RULE = String.fromCharCode(10, 10) + '---' + String.fromCharCode(10, 10);

    function boxedPage(fixture: ComponentFixture<WritePage>): PageInternals {
      const page = internals(fixture);
      page.newDraft();
      page.setSplitMode('boxes');
      fixture.detectChanges();
      return page;
    }

    it('renders one box per post once the mode is chosen', () => {
      const fixture = setUp();
      const page = boxedPage(fixture);
      page.onBodyInput('first' + RULE + 'second');
      fixture.detectChanges();

      expect(page.boxed()).toBe(true);
      expect(page.boxes()).toEqual(['first', 'second']);
    });

    /**
     * The toggle must be lossless in both directions. `boxes` and `rule` share
     * one stored string precisely so switching cannot rewrite a draft.
     */
    it('switches between layouts without changing the draft', () => {
      const fixture = setUp();
      const page = boxedPage(fixture);
      page.onBodyInput('first' + RULE + 'second');
      const stored = page.body();

      page.setSplitMode('rule');
      fixture.detectChanges();
      expect(page.boxed()).toBe(false);
      expect(page.body()).toBe(stored);

      page.setSplitMode('boxes');
      fixture.detectChanges();
      expect(page.boxes()).toEqual(['first', 'second']);
      expect(page.body()).toBe(stored);
    });

    it('adds a box that is empty and ready to type in', () => {
      const fixture = setUp();
      const page = boxedPage(fixture);
      page.onBodyInput('only post');
      page.addBox();

      expect(page.boxes()).toEqual(['only post', '']);
      // An empty box is not a post; the thread is still one post long.
      expect(page.segments().map((segment) => segment.text)).toEqual(['only post']);
    });

    it('edits one box without disturbing its neighbours', () => {
      const fixture = setUp();
      const page = boxedPage(fixture);
      page.onBodyInput('first' + RULE + 'second');
      page.setBoxText(0, 'rewritten');

      expect(page.boxes()).toEqual(['rewritten', 'second']);
    });

    it('removes a box and keeps the rest', () => {
      const fixture = setUp();
      const page = boxedPage(fixture);
      page.onBodyInput('first' + RULE + 'second' + RULE + 'third');
      page.removeBox(1);

      expect(page.boxes()).toEqual(['first', 'third']);
    });

    it('never leaves the editor with no box at all', () => {
      const fixture = setUp();
      const page = boxedPage(fixture);
      page.onBodyInput('only post');
      page.removeBox(0);

      expect(page.boxes()).toEqual(['']);
    });

    it('remembers the layout per draft, like the other split modes', () => {
      const fixture = setUp();
      const page = boxedPage(fixture);
      page.onBodyInput('written in boxes');
      page.save();
      fixture.detectChanges();

      const key = page.editing()?.key;
      expect(key).toBeDefined();
      expect(TestBed.inject(WriteWorkspace).splitMode(key as string)).toBe('boxes');
    });
  });

  // ------------------------------------------------------- editor conveniences

  describe('editor conveniences', () => {
    it('shows the raw split by default and can render it instead', () => {
      const fixture = setUp();
      const page = internals(fixture);
      page.newDraft();
      page.onBodyInput('**bold** writing');
      fixture.detectChanges();

      expect(page.renderedPreview()).toBe(false);
      expect(fixture.nativeElement.textContent).toContain('**bold** writing');

      page.renderedPreview.set(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.segment-text strong')).not.toBeNull();
    });

    it('notices a long link and offers to shorten it', () => {
      const fixture = setUp();
      const page = internals(fixture);
      page.newDraft();
      page.onBodyInput('see https://example.com/' + 'p'.repeat(80));
      fixture.detectChanges();

      expect(page.longLinks()).toHaveLength(1);
      expect(fixture.nativeElement.textContent).toContain('23 characters');
    });

    /**
     * Scheduling without walking the wizard. The control writes the same signal
     * the wizard's "when" step does, so a time set here is the time published.
     */
    it('schedules from the editor bar and clears again', () => {
      const fixture = setUp();
      const page = internals(fixture);
      page.newDraft();
      page.onBodyInput('later, please');
      page.setWizardScheduleAt('2126-01-01T09:00');
      fixture.detectChanges();
      expect(page.wizardScheduleAt()).toBe('2126-01-01T09:00');

      page.setWizardScheduleAt('');
      expect(page.wizardScheduleAt()).toBe('');
    });
  });

  // ---------------------------------------------------------------- alt text

  describe('alt text', () => {
    function withImage(fixture: ComponentFixture<WritePage>, description = ''): void {
      internals(fixture).media.set([
        {
          media: {
            id: 'local:1',
            type: 'image',
            url: 'blob:x',
            preview_url: 'blob:x',
            description: null,
          },
          description,
        },
      ]);
      fixture.detectChanges();
    }

    /**
     * The user asked for the friction or they did not. Without the opt-in this
     * is advice shown where the description is typed, and publishing stays
     * available — a warning that blocks is a requirement wearing a disguise.
     */
    it('advises without blocking when the requirement is off', () => {
      TestBed.inject(ClientPrefs).requireAltText.set(false);
      const fixture = setUp();
      const page = internals(fixture);
      page.newDraft();
      withImage(fixture);

      expect(page.altTextNote()).toContain('Screen readers will skip');
      expect(page.altTextMissing()).toBe(false);
      expect(fixture.nativeElement.textContent).toContain('Screen readers will skip');
    });

    it('blocks publishing once the user opts into the requirement', async () => {
      TestBed.inject(ClientPrefs).requireAltText.set(true);
      const fixture = setUp();
      const page = internals(fixture);
      page.newDraft();
      page.onBodyInput('a post with a picture');
      withImage(fixture);

      expect(page.altTextMissing()).toBe(true);
      await page.wizardFinish();
      expect(page.wizardError()).toContain('before publishing');
    });

    it('says nothing once every attachment is described', () => {
      TestBed.inject(ClientPrefs).requireAltText.set(true);
      const fixture = setUp();
      const page = internals(fixture);
      page.newDraft();
      withImage(fixture, 'a photograph of a cat');

      expect(page.altTextNote()).toBeNull();
      expect(page.altTextMissing()).toBe(false);
    });

    /**
     * The writing page used to check `type === 'image'` while the compact
     * composer checked every attachment, so the same video was nagged about in
     * one surface and silently accepted in the other.
     */
    it('asks for a description on a video, not only on images', () => {
      TestBed.inject(ClientPrefs).requireAltText.set(true);
      const fixture = setUp();
      const page = internals(fixture);
      page.newDraft();
      page.media.set([
        {
          media: {
            id: 'local:1',
            type: 'video',
            url: 'blob:x',
            preview_url: 'blob:x',
            description: null,
          },
          description: '',
        },
      ]);
      fixture.detectChanges();

      expect(page.altTextMissing()).toBe(true);
    });
  });

  // ------------------------------------------------------- proofreader place

  describe('the AI proofreader in the editor', () => {
    function withProofreader(findings: ProofreadingFinding[]): ReturnType<typeof vi.fn> {
      const run = vi.fn(async () => findings);
      TestBed.overrideProvider(AiAvailability, { useValue: { enabled: signal(true) } });
      TestBed.overrideProvider(OpenRouterSession, { useValue: { connected: signal(true) } });
      TestBed.overrideProvider(Proofreader, {
        useValue: {
          run,
          preview: () => ({
            connector: 'OpenRouter' as const,
            model: 'test/proofreader',
            prompt: 'prompt',
          }),
        },
      });
      return run;
    }

    /**
     * The point of the move. Findings that are only visible inside a modal are
     * findings you cannot act on: the old flow was read, cancel, fix, reopen,
     * and pay OpenRouter again for the next look.
     */
    it('keeps the text editable while findings are on screen', async () => {
      withProofreader([{ message: 'Consider a shorter opening.' }]);
      TestBed.inject(Auth).mode.set('anonymous');
      const fixture = setUp();
      const page = internals(fixture);
      page.newDraft();
      page.onBodyInput('the original text');
      await page.confirmAiProofreader();
      fixture.detectChanges();

      expect(page.aiFindings()).toHaveLength(1);
      expect(page.wizardStep()).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Consider a shorter opening.');

      page.onBodyInput('the revised text');
      expect(page.body()).toBe('the revised text');
    });

    /**
     * Findings describe the text they were asked about. Leaving them on screen
     * after an edit would attribute the model's notes to writing it never saw.
     */
    it('drops stale findings as soon as the text changes', async () => {
      withProofreader([{ message: 'Consider a shorter opening.' }]);
      TestBed.inject(Auth).mode.set('anonymous');
      const page = internals(setUp());
      page.newDraft();
      page.onBodyInput('the original text');
      await page.confirmAiProofreader();
      expect(page.aiFindings()).toHaveLength(1);

      page.onBodyInput('the original text, rewritten');

      expect(page.aiFindings()).toEqual([]);
      expect(page.aiProofreadComplete()).toBe(false);
    });

    it('sends nothing until the disclosed prompt is confirmed', () => {
      const run = withProofreader([]);
      TestBed.inject(Auth).mode.set('anonymous');
      const fixture = setUp();
      const page = internals(fixture);
      page.newDraft();
      page.onBodyInput('unsent writing');
      page.toggleProofreadConsent();
      fixture.detectChanges();

      expect(run).not.toHaveBeenCalled();
      expect(page.proofreadConsentOpen()).toBe(true);
    });
  });
});
