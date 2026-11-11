/**
 * The ••• menu budget: the most options any one post or profile menu may show.
 *
 * Menus grow one handy entry at a time until nobody can scan them. Past this
 * many, the less-used entries belong in a dialog reached from one menu entry.
 * `menu-budget.spec.ts` files render real scenarios and fail the build when a
 * menu goes over; run `npm run menu:sizes` to see the table.
 */
export const MENU_BUDGET = 10;

/**
 * The options a reader scans in a rendered ••• panel, by label.
 *
 * Counts each enabled-or-disabled `button`/`a` once, except:
 * - the trailing Close entry (`.menu-close`), which is not an option;
 * - a row of mute durations (`.mute-durations`), which reads as one
 *   "Mute for…" choice, labelled by the note before it;
 * - anything `hidden`, or inside a nested dialog a menu entry opened.
 */
export function menuOptions(panel: Element): string[] {
  const options: string[] = [];
  const counted = new Set<Element>();
  for (const el of panel.querySelectorAll<HTMLElement>('button, a')) {
    if (el.closest('[hidden], dialog, [role="dialog"], mb-dialog')) continue;
    if (el.classList.contains('menu-close')) continue;
    const durations = el.closest('.mute-durations');
    if (durations) {
      if (counted.has(durations)) continue;
      counted.add(durations);
      const note = durations.previousElementSibling?.textContent?.trim();
      options.push(note || 'Mute for…');
      continue;
    }
    options.push((el.textContent ?? '').replace(/\s+/g, ' ').trim());
  }
  return options;
}

/** One measured menu, for the report and the failure message. */
export interface MenuMeasure {
  menu: string;
  scenario: string;
  options: string[];
}

export function menuReport(rows: readonly MenuMeasure[]): string {
  const lines = rows.map(
    (r) =>
      `${r.options.length > MENU_BUDGET ? '✗' : '✓'} ${r.menu} · ${r.scenario}: ` +
      `${r.options.length}/${MENU_BUDGET}`,
  );
  return ['••• menu sizes', ...lines].join('\n');
}

/**
 * Print the table. Vitest hides console output from passing tests, so this
 * writes to the worker's stdout directly; it is a no-op where there is none.
 */
export function printMenuReport(rows: readonly MenuMeasure[]): void {
  const out = (globalThis as { process?: { stdout?: { write(text: string): unknown } } }).process
    ?.stdout;
  out?.write(menuReport(rows) + '\n');
}

export function overBudgetMessage(row: MenuMeasure): string {
  return (
    `${row.menu} · ${row.scenario} has ${row.options.length} options (budget ${MENU_BUDGET}). ` +
    `Move less-used entries into a dialog. Options: ${row.options.join(' | ')}`
  );
}
