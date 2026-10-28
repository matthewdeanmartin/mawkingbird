import { Component, computed, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { BulkActions, BulkTarget } from '../../bulk-actions';
import { BulkActionsDialog } from '../../bulk-actions-dialog/bulk-actions-dialog';
import { BulkProgress } from '../../bulk-progress/bulk-progress';
import { FollowButton } from '../../follow-button/follow-button';
import { Discussion, discussionKey, summarize } from '../../forum/discussion';
import { ForumScan } from '../../forum/forum-scan';
import { ForumView } from '../../forum/forum-view';
import { Account, Status } from '../../models';
import { account, originCopy, post, reply, who } from '../../testing/forum-fixtures';
import { ForumListDialog } from './forum-list-dialog';
import { ForumMembers } from './forum-members';

@Component({
  selector: 'app-follow-button',
  template: '<span class="follow">{{ accountId() }}</span>',
})
class FollowStub {
  readonly accountId = input.required<string>();
  readonly handle = input('');
  readonly foreign = input<Account | null>(null);
}

@Component({ template: '' })
class Blank {}

@Component({ selector: 'app-bulk-progress', template: '' })
class ProgressStub {}

@Component({ selector: 'app-bulk-actions-dialog', template: '<p class="bulk-dialog"></p>' })
class BulkDialogStub {
  readonly action = input.required<string>();
  readonly target = input<BulkTarget | undefined>(undefined);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}

@Component({ selector: 'app-forum-list-dialog', template: '<p class="list-dialog"></p>' })
class ListDialogStub {
  readonly accounts = input.required<Account[]>();
  readonly closed = output<void>();
}

function discussion(posts: Status[]): Discussion {
  return {
    key: discussionKey(posts[0]),
    anchor: posts[0],
    partial: false,
    posts,
    treeLoaded: true,
  };
}

describe('ForumMembers', () => {
  const root = post('1', 'a');
  const fromB = reply('2', 'b', root);
  const fromMe = reply('3', 'me', fromB);
  const again = reply('4', 'b', fromMe);
  const remote = originCopy(reply('5', 'r', root));
  let found: ReturnType<typeof signal<Discussion[]>>;
  let bulk: { running: ReturnType<typeof signal<boolean>>; start: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<ForumMembers>;

  beforeEach(() => {
    found = signal([discussion([root, fromB, fromMe, again, remote])]);
    bulk = { running: signal(false), start: vi.fn() };
    const following = signal<ReadonlySet<string>>(new Set([who('b')]));
    TestBed.configureTestingModule({
      imports: [ForumMembers],
      providers: [
        provideRouter([{ path: 'forum', component: Blank }]),
        {
          provide: ForumScan,
          useValue: {
            following,
            listParams: { source: ['tag:rust'] },
            containing: (id: string) =>
              found().find((each) => each.posts.some((p) => p.id === id)) ?? null,
            summaries: computed(() =>
              found().map((each) => summarize(each, who('me'), following())),
            ),
          },
        },
        { provide: Auth, useValue: { account: signal(account('me')) } },
        { provide: BulkActions, useValue: bulk },
      ],
    });
    TestBed.overrideComponent(ForumMembers, {
      remove: { imports: [FollowButton, BulkProgress, BulkActionsDialog, ForumListDialog] },
      add: { imports: [FollowStub, ProgressStub, BulkDialogStub, ListDialogStub] },
    });
  });

  function mount(focus: string | null): HTMLElement {
    TestBed.inject(ForumView).focus.set(focus);
    fixture = TestBed.createComponent(ForumMembers);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function names(host: HTMLElement): string[] {
    return [...host.querySelectorAll('li button.who .name')].map((b) => b.textContent!.trim());
  }

  it('lists everyone in the open discussion, starter first, with their roles', () => {
    const host = mount('1');
    expect(host.querySelector('h2')!.textContent).toContain('In this discussion');
    expect(names(host)).toEqual(['User a', 'User b', 'User r', 'User me']);
    const rows = [...host.querySelectorAll('li')].map((li) => li.textContent!);
    expect(rows[0]).toContain('Started it');
    expect(rows[1]).toContain('Following');
    expect(rows[1]).toContain('2 posts');
    expect(rows[3]).toContain('You');
  });

  it('lists the whole discussion when a reply in it is open', () => {
    expect(names(mount('3'))).toEqual(['User a', 'User b', 'User r', 'User me']);
  });

  it('offers no follow button for me, and follows other servers’ people through webfinger', () => {
    const host = mount('1');
    expect([...host.querySelectorAll('.follow')].map((f) => f.textContent)).toEqual([
      'a',
      'b',
      'o-r',
    ]);
    const remoteButton = fixture.debugElement
      .queryAll(By.directive(FollowStub))
      .map((el) => el.componentInstance as FollowStub)[2];
    expect(remoteButton.foreign()?.id).toBe('o-r');
  });

  it('follows everyone on my server but me, as a bulk job', () => {
    const host = mount('1');
    const followAll = [...host.querySelectorAll('.actions button')].find((b) =>
      b.textContent!.includes('Follow everyone'),
    ) as HTMLButtonElement;
    followAll.click();
    fixture.detectChanges();
    const dialog = fixture.debugElement.query(By.directive(BulkDialogStub))
      .componentInstance as BulkDialogStub;
    const target = dialog.target()!;
    expect(target.kind).toBe('discussion');
    expect(target.accounts!.map((a) => a.id)).toEqual(['a', 'b']);
    dialog.confirmed.emit();
    expect(bulk.start).toHaveBeenCalledWith('list-follow', target);
  });

  it('opens the list dialog with the same people', () => {
    const host = mount('1');
    const add = [...host.querySelectorAll('.actions button')].find((b) =>
      b.textContent!.includes('Add everyone to a list'),
    ) as HTMLButtonElement;
    add.click();
    fixture.detectChanges();
    const dialog = fixture.debugElement.query(By.directive(ListDialogStub))
      .componentInstance as ListDialogStub;
    expect(dialog.accounts().map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('shows the most active people beside the list, without group actions', () => {
    const other = post('7', 'c');
    found.set([...found(), discussion([other, reply('8', 'b', other)])]);
    const host = mount(null);
    expect(host.querySelector('h2')!.textContent).toContain('Most active');
    expect(names(host)[0]).toBe('User b');
    expect(host.textContent).toContain('in 2 discussions');
    expect(host.querySelector('.actions')).toBeNull();
  });

  it('narrows the list to a person’s discussions, keeping the list’s source', async () => {
    const host = mount(null);
    (host.querySelector('li button.who') as HTMLButtonElement).click();
    await fixture.whenStable();
    const url = TestBed.inject(Router).url;
    expect(url).toContain('/forum?source=tag:rust');
    expect(decodeURIComponent(url)).toContain(`person=${who('b')}`);
  });

  it('explains a discussion the scan never found', () => {
    expect(mount('99').textContent).toContain('Open this discussion from a Forum scan');
  });
});
