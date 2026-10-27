import { Component, computed, forwardRef, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { Compose } from '../../compose/compose';
import { MediaAttachment, Status } from '../../models';
import { RadioStudio } from './radio-studio';
import { RadioStudioSession } from './radio-studio-session';
import { StudioPage } from './studio-page';

@Component({
  selector: 'app-compose',
  template: '',
  providers: [{ provide: Compose, useExisting: forwardRef(() => ComposeStub) }],
})
class ComposeStub {
  readonly draftContext = input('');
  readonly placeholder = input('');
  readonly acceptHandoff = input(false);
  readonly posted = output<Status>();
  readonly media = signal<MediaAttachment[]>([]);
  readonly attachmentIds = computed(() => this.media().map((media) => media.id));
  accepts = true;
  attachUploaded(media: MediaAttachment): boolean {
    if (!this.accepts) return false;
    this.media.update((list) => [...list, media]);
    return true;
  }
  removeMedia(index: number): void {
    this.media.update((list) => list.filter((_, i) => i !== index));
  }
}

@Component({ selector: 'app-radio-studio', template: 'catalogue' })
class CatalogueStub {}

describe('StudioPage', () => {
  const processed = { id: 'audio', type: 'audio', url: 'https://example.com/a.wav' };
  let session: {
    file: ReturnType<typeof signal<File | null>>;
    attached: ReturnType<typeof signal<MediaAttachment | null>>;
    preview: ReturnType<typeof signal<string>>;
    busy: ReturnType<typeof signal<boolean>>;
    locked: ReturnType<typeof signal<boolean>>;
    ready: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string>>;
    published: ReturnType<typeof signal<Status | null>>;
    stage: ReturnType<typeof vi.fn>;
    attach: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
    discard: ReturnType<typeof vi.fn>;
    posted: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    session = {
      file: signal<File | null>(new File(['x'], 'take.wav', { type: 'audio/wav' })),
      attached: signal<MediaAttachment | null>(null),
      preview: signal('blob:take'),
      busy: signal(false),
      locked: signal(false),
      ready: signal(true),
      error: signal(''),
      published: signal<Status | null>(null),
      stage: vi.fn(),
      attach: vi.fn(async () => {
        session.attached.set(processed as MediaAttachment);
        return processed;
      }),
      detach: vi.fn(() => session.attached.set(null)),
      discard: vi.fn(() => session.attached.set(null)),
      posted: vi.fn(),
      initialize: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RadioStudioSession, useValue: session },
        { provide: Auth, useValue: { isAnonymous: false, isBlueskyPrimary: false } },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
      ],
    });
    TestBed.overrideComponent(StudioPage, {
      remove: { imports: [Compose, RadioStudio] },
      add: { imports: [ComposeStub, CatalogueStub] },
    });
  });

  function setUp() {
    const fixture = TestBed.createComponent(StudioPage);
    fixture.detectChanges();
    const composer = fixture.debugElement.children[0].query(
      (element) => element.componentInstance instanceof ComposeStub,
    ).componentInstance as ComposeStub;
    return { fixture, composer };
  }

  it('shows file details and hands the processed recording to the composer', async () => {
    const { fixture, composer } = setUp();
    expect(fixture.nativeElement.textContent).toContain('WAV');
    await fixture.componentInstance.attach();
    fixture.detectChanges();
    expect(composer.attachmentIds()).toEqual(['audio']);
    expect(fixture.nativeElement.textContent).toContain('Attached and processed.');
  });

  it('releases the session when the composer removes the recording, and reports a refusal', async () => {
    const { fixture, composer } = setUp();
    await fixture.componentInstance.attach();
    TestBed.tick();
    composer.removeMedia(0);
    TestBed.tick();
    expect(session.detach).toHaveBeenCalledOnce();
    composer.accepts = false;
    await fixture.componentInstance.attach();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'The composer cannot take audio right now.',
    );
  });

  it('reattaches a processed recording to a recreated composer and records the publication', () => {
    session.attached.set(processed as MediaAttachment);
    const { fixture, composer } = setUp();
    TestBed.tick();
    expect(composer.attachmentIds()).toEqual(['audio']);
    expect(session.detach).not.toHaveBeenCalled();
    const post = { id: '1' } as Status;
    composer.posted.emit(post);
    expect(session.posted).toHaveBeenCalledWith(post);
    fixture.componentInstance.discard();
    expect(session.discard).toHaveBeenCalled();
  });
});
