import { Component, OnDestroy, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HumanTimePipe } from '../../../human-time.pipe';
import { DraftItem } from '../../drafts/draft-items';
import { WriteColumn, WriteWorkspace } from '../write-workspace';
import {
  BOARD_COLUMNS,
  columnHint,
  columnLabel,
  groupByColumn,
  isDerivedColumn,
  movableColumns,
} from './board-columns';
import { Terminology } from '../../../terminology';

/**
 * Roughly how tall and wide the move menu renders.
 *
 * Used only to decide whether to flip it above the button and how far to pull
 * it left — being a few pixels out shifts the menu slightly, it does not break
 * anything, so measuring the rendered element (and forcing a layout to do it)
 * would buy nothing.
 */
const MENU_HEIGHT = 150;
const MENU_WIDTH = 150;

/**
 * The kanban board: everything unpublished, by how far along it is.
 *
 * `/write`'s draft list is time-sorted, which answers "what was I doing
 * yesterday" and not "what is nearly done". This answers the second.
 *
 * ## Why this is a component and not part of the page
 *
 * Where the board lives is **not settled**. Today it opens as a panel inside
 * `/write`; it may yet turn out there is not the real estate and it needs a
 * screen of its own. So its entire contract with the outside world is the four
 * members below — items in, "open this" and "close me" out — and it injects
 * only {@link WriteWorkspace}, for the column it reads and writes.
 *
 * Mounting it at a route later must be: add a route, pass it the same items.
 * If moving it means touching anything in here, the boundary was drawn wrong.
 * Its spec mounts it standalone for exactly that reason.
 */
// i18n pages.write.board.title: Board
// i18n pages.write.board.intro: Everything unpublished, by how far along it is. Drag a card, or use its ⋯ menu.
// i18n pages.write.board.close: Close board
// i18n pages.write.board.moveSetByScheduling: {{column}} is set by scheduling a post, not by moving it here.
// i18n pages.write.board.scheduledStays: A scheduled post stays in Scheduled until it publishes or is cancelled.
// i18n pages.write.board.movedTo: Moved to {{column}}.
// i18n pages.write.board.moveTo: Move to
// i18n pages.write.board.moveAriaLabel: Move {{preview}} to another column
// i18n pages.write.board.title.parked: Parked as a far-future scheduled {{noun}}
// i18n pages.write.board.title.selfOnly: A {{noun}} visible only to you
// i18n pages.write.board.columnDraftCount.one: {{count}} draft
// i18n pages.write.board.columnDraftCount.other: {{count}} drafts
@Component({
  selector: 'app-write-board',
  imports: [HumanTimePipe, TranslocoPipe],
  templateUrl: './write-board.html',
  styleUrl: './write-board.css',
})
export class WriteBoard implements OnDestroy {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;
  private transloco = inject(TranslocoService);

  private workspace = inject(WriteWorkspace);

  /**
   * Close the move menu whenever anything scrolls, anywhere.
   *
   * On `window` in the capture phase because `scroll` does not bubble, and the
   * containers that matter are not all inside this component — the column list
   * is, but the panel hosting the board is not. A fixed-position menu does not
   * travel with the card it belongs to, so a scroll must dismiss it or it ends
   * up floating over unrelated rows.
   */
  private readonly onAnyScroll = (): void => this.onScrollAway();

  constructor() {
    window.addEventListener('scroll', this.onAnyScroll, true);
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onAnyScroll, true);
  }

  readonly items = input.required<readonly DraftItem[]>();
  /** Highlights whichever draft the editor currently holds. */
  readonly currentKey = input<string | null>(null);
  /** "Put this one in the editor." */
  readonly opened = output<DraftItem>();
  /** "I am done looking." */
  readonly closed = output<void>();

  protected readonly label = columnLabel;
  protected readonly hint = columnHint;
  protected readonly derived = isDerivedColumn;
  protected readonly moveTargets = movableColumns();

  /** Which card's "Move to…" menu is open, by key. */
  protected menuFor = signal<string | null>(null);
  /**
   * Where to draw the open menu, in viewport coordinates.
   *
   * The menu is `position: fixed` because the column it lives in scrolls, and a
   * scroll container clips absolutely-positioned descendants no matter their
   * z-index. Fixed positioning escapes the clip but not the need for
   * coordinates, so they are measured from the button that opened it.
   */
  protected menuAt = signal<{ top: number; left: number } | null>(null);
  /** The last move, announced for screen readers. */
  protected announcement = signal('');

  protected columns = computed(() =>
    groupByColumn(this.items(), (key) => this.workspace.column(key)),
  );

  protected count(column: WriteColumn): number {
    return this.columns().find((c) => c.id === column)?.items.length ?? 0;
  }

  protected open(item: DraftItem): void {
    this.opened.emit(item);
  }

  protected close(): void {
    this.closed.emit();
  }

  /**
   * Open or close a card's move menu, anchoring it under its button.
   *
   * Flipped above the button when there is not room below, so a card near the
   * bottom of a tall column does not open a menu off the edge of the screen.
   */
  protected toggleMenu(item: DraftItem, event: MouseEvent): void {
    if (this.menuFor() === item.key) {
      this.closeMenu();
      return;
    }
    const button = event.currentTarget as HTMLElement | null;
    const rect = button?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      this.menuAt.set({
        top: below < MENU_HEIGHT ? rect.top - MENU_HEIGHT : rect.bottom + 4,
        // Right-aligned to the button, which is itself at the card's right edge.
        left: Math.max(8, rect.right - MENU_WIDTH),
      });
    }
    this.menuFor.set(item.key);
  }

  protected closeMenu(): void {
    this.menuFor.set(null);
    this.menuAt.set(null);
  }

  /**
   * Close the menu when anything moves under it.
   *
   * A fixed-position menu does not travel with the column it belongs to, so
   * scrolling would otherwise leave it stranded over unrelated cards. Closing
   * is both simpler and less surprising than tracking.
   */
  protected onScrollAway(): void {
    if (this.menuFor()) {
      this.closeMenu();
    }
  }

  /**
   * Move a card, by menu or by drop.
   *
   * Instant and local — no request, no undo. The cost of a wrong move is one
   * more move, which is cheaper than an undo affordance nobody would find.
   *
   * Refuses anything involving Scheduled in either direction: a draft becomes
   * scheduled by *being scheduled* (the publish wizard's last step, or the park
   * action on /drafts), and dragging a card out of Scheduled would claim to
   * cancel a publish it has not cancelled.
   */
  protected move(item: DraftItem, to: WriteColumn): void {
    this.closeMenu();
    if (isDerivedColumn(to)) {
      this.announce(
        this.transloco.translate<string>('pages.write.board.moveSetByScheduling', {
          column: this.transloco.translate<string>(this.label(to)),
        }),
      );
      return;
    }
    if (item.kind === 'scheduled') {
      this.announce(this.transloco.translate<string>('pages.write.board.scheduledStays'));
      return;
    }
    this.workspace.setColumn(item.key, to);
    this.announce(
      this.transloco.translate<string>('pages.write.board.movedTo', {
        column: this.transloco.translate<string>(this.label(to)),
      }),
    );
  }

  // ------------------------------------------------------------ drag and drop
  //
  // Built on top of the keyboard path rather than beside it: `move()` is the
  // one place a card changes column, so the two routes cannot disagree.

  protected dragging = signal<string | null>(null);
  protected dragOver = signal<WriteColumn | null>(null);

  protected onDragStart(item: DraftItem, event: DragEvent): void {
    this.dragging.set(item.key);
    event.dataTransfer?.setData('text/plain', item.key);
  }

  protected onDragEnd(): void {
    this.dragging.set(null);
    this.dragOver.set(null);
  }

  protected onDragOver(column: WriteColumn, event: DragEvent): void {
    if (isDerivedColumn(column)) {
      return;
    }
    // Without this the drop never fires — the default is "reject".
    event.preventDefault();
    this.dragOver.set(column);
  }

  protected onDrop(column: WriteColumn, event: DragEvent): void {
    event.preventDefault();
    const key = this.dragging() ?? event.dataTransfer?.getData('text/plain') ?? null;
    this.dragging.set(null);
    this.dragOver.set(null);
    const item = key ? this.items().find((i) => i.key === key) : undefined;
    if (item) {
      this.move(item, column);
    }
  }

  /**
   * Say what happened.
   *
   * A move is a purely visual change, so without this it is invisible to
   * exactly the users who most need the keyboard path.
   */
  private announce(message: string): void {
    this.announcement.set(message);
  }

  protected readonly boardColumns = BOARD_COLUMNS;
}
