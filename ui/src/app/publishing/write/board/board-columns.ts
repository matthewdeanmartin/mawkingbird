import { DraftItem } from '../../drafts/draft-items';
import { WriteColumn } from '../write-workspace';

/** Left to right, in the order writing actually moves. */
export const BOARD_COLUMNS: readonly WriteColumn[] = ['ideas', 'writing', 'editing', 'scheduled'];

/**
 * The column a draft belongs in.
 *
 * `scheduled` is **derived, never stored**: a parked or genuinely-scheduled
 * draft *is* scheduled, and that is a fact about the draft rather than an
 * opinion about it. A stored column that disagrees is ignored rather than
 * honoured — the alternative is a card sitting in Editing that the server is
 * about to publish regardless.
 *
 * Everything else takes the user's stored column, defaulting to **Ideas**:
 * a draft nobody has triaged has not been started, and the board's job is to
 * make untouched work visible rather than to flatter it.
 */
export function columnFor(item: DraftItem, stored: WriteColumn | undefined): WriteColumn {
  if (item.kind === 'scheduled') {
    return 'scheduled';
  }
  // A stored `scheduled` on a draft that isn't one would strand the card in a
  // column it can never legitimately be dragged out of.
  return stored && stored !== 'scheduled' ? stored : 'ideas';
}

/** Whether a card in this column can be moved by hand. */
export function isDerivedColumn(column: WriteColumn): boolean {
  return column === 'scheduled';
}

export interface BoardColumn {
  id: WriteColumn;
  items: DraftItem[];
}

/**
 * Bucket every item into its column, newest first within each.
 *
 * Takes a lookup rather than the workspace service so it stays pure — the
 * component passes `(key) => workspace.column(key)`.
 */
export function groupByColumn(
  items: readonly DraftItem[],
  storedColumn: (key: string) => WriteColumn | undefined,
): BoardColumn[] {
  const buckets = new Map<WriteColumn, DraftItem[]>(BOARD_COLUMNS.map((id) => [id, []]));
  for (const item of items) {
    buckets.get(columnFor(item, storedColumn(item.key)))!.push(item);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }
  return BOARD_COLUMNS.map((id) => ({ id, items: buckets.get(id)! }));
}

// i18n pages.write.board.column.ideas.label: Ideas
// i18n pages.write.board.column.writing.label: Writing
// i18n pages.write.board.column.editing.label: Editing
// i18n pages.write.board.column.scheduled.label: Scheduled
/** Translation key for a column's heading. */
export function columnLabel(column: WriteColumn): string {
  switch (column) {
    case 'ideas':
      return 'pages.write.board.column.ideas.label';
    case 'writing':
      return 'pages.write.board.column.writing.label';
    case 'editing':
      return 'pages.write.board.column.editing.label';
    case 'scheduled':
      return 'pages.write.board.column.scheduled.label';
  }
}

// i18n pages.write.board.column.ideas.hint: Anything jotted down but not started.
// i18n pages.write.board.column.writing.hint: In progress — a draft you are still adding to.
// i18n pages.write.board.column.editing.hint: Written, and waiting to be read back.
// i18n pages.write.board.column.scheduled.hint: Parked or scheduled. Cards arrive here by being scheduled, not by being moved.
/**
 * Translation key for what belongs in a column, for its empty state.
 *
 * This is the only place the four columns' meanings are ever written down, so
 * an empty column keeps its heading and says this — an unexplained empty
 * column reads as broken rather than as available.
 */
export function columnHint(column: WriteColumn): string {
  switch (column) {
    case 'ideas':
      return 'pages.write.board.column.ideas.hint';
    case 'writing':
      return 'pages.write.board.column.writing.hint';
    case 'editing':
      return 'pages.write.board.column.editing.hint';
    case 'scheduled':
      return 'pages.write.board.column.scheduled.hint';
  }
}

/** The columns a card can be moved into by hand. */
export function movableColumns(): WriteColumn[] {
  return BOARD_COLUMNS.filter((column) => !isDerivedColumn(column));
}
