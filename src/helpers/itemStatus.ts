import update from 'immutability-helper';
import { StateManager } from 'src/StateManager';
import { Item } from 'src/components/types';
import {
  getTaskStatusDone,
  getTaskStatusPreDone,
  getTasksStatusSettings,
  toggleTask,
} from 'src/parsers/helpers/inlineMetadata';

export interface StatusOption {
  symbol: string;
  name: string;
}

/**
 * Common alternate checkbox statuses (Minimal / SlRvb / Things conventions).
 * Names from the Tasks plugin's status settings take precedence when a symbol
 * is defined there.
 */
export const builtInStatuses: StatusOption[] = [
  { symbol: ' ', name: 'To do' },
  { symbol: '/', name: 'In progress' },
  { symbol: '?', name: 'Question / follow-up' },
  { symbol: '!', name: 'Important' },
  { symbol: 'D', name: 'Date / event' },
  { symbol: 'R', name: 'Research' },
  { symbol: 'B', name: 'Brainstorm / idea' },
  { symbol: '>', name: 'Forwarded / moved' },
  { symbol: '-', name: 'Cancelled' },
  { symbol: 'x', name: 'Done' },
];

/** Merge built-in statuses with the Tasks plugin's statuses. Done is listed last. */
export function getStatusOptions(tasksStatuses?: any, doneSymbol = 'x'): StatusOption[] {
  const bySymbol = new Map<string, StatusOption>();
  for (const s of builtInStatuses) bySymbol.set(s.symbol, { ...s });

  const fromTasks = [
    ...(tasksStatuses?.coreStatuses ?? []),
    ...(tasksStatuses?.customStatuses ?? []),
  ];
  for (const s of fromTasks) {
    if (typeof s?.symbol !== 'string' || s.symbol.length !== 1) continue;
    bySymbol.set(s.symbol, { symbol: s.symbol, name: s.name || s.symbol });
  }

  const options = [...bySymbol.values()];
  const doneIndex = options.findIndex((o) => o.symbol === doneSymbol);
  if (doneIndex > -1) options.push(options.splice(doneIndex, 1)[0]);
  return options;
}

const doneDateRegEx = /\s*✅\s*\d{4}-\d{2}-\d{2}/gu;

/** Remove a Tasks done date (✅ YYYY-MM-DD) from a card's first line. */
export function stripDoneDate(titleRaw: string): string {
  const [first, ...rest] = titleRaw.split('\n');
  return [first.replace(doneDateRegEx, ''), ...rest].join('\n');
}

/**
 * Set a card's status. Marking Done goes through the Tasks plugin (when
 * available) so it adds the done date and handles recurrence; leaving Done
 * removes the done date. Returns the replacement item(s).
 */
export function setItemStatus(stateManager: StateManager, item: Item, symbol: string): Item[] {
  const doneSymbol = getTaskStatusDone();
  const isDone = item.data.checked && item.data.checkChar === doneSymbol;

  if (symbol === item.data.checkChar) return [item];

  if (symbol === doneSymbol) {
    const preDone = update(item, {
      data: { checkChar: { $set: getTaskStatusPreDone() }, checked: { $set: false } },
    });
    const updates = toggleTask(preDone, stateManager.file);

    if (updates) {
      const [itemStrings, checkChars, thisIndex] = updates;
      return itemStrings.map((str, i) => {
        const next = stateManager.getNewItem(str, checkChars[i]);
        if (i === thisIndex) next.id = item.id;
        return next;
      });
    }
  }

  const titleRaw = isDone ? stripDoneDate(item.data.titleRaw) : item.data.titleRaw;
  const withStatus = update(item, {
    data: { checkChar: { $set: symbol }, checked: { $set: symbol !== ' ' } },
  });

  return [stateManager.updateItemContent(withStatus, titleRaw)];
}

// ---------------------------------------------------------------------------
// Remember a card's status when it enters a Complete lane, so moving it back
// out restores e.g. [?] or [/] instead of resetting to [ ]. Session-scoped.
// ---------------------------------------------------------------------------
const statusBeforeComplete = new Map<string, string>();

function statusKey(filePath: string, titleRaw: string) {
  const firstLine = stripDoneDate(titleRaw.split('\n')[0])
    .replace(/\s*❌\s*\d{4}-\d{2}-\d{2}/gu, '')
    .trim();
  return `${filePath}::${firstLine}`;
}

export function rememberStatusBeforeComplete(filePath: string, item: Item, doneSymbol: string) {
  const key = statusKey(filePath, item.data.titleRaw);
  const char = item.data.checkChar;

  if (char === ' ' || char === doneSymbol) {
    statusBeforeComplete.delete(key);
  } else {
    statusBeforeComplete.set(key, char);
  }
}

/** Status to restore when a card leaves a Complete lane (or undefined). Idempotent. */
export function recallStatusBeforeComplete(filePath: string, item: Item): string | undefined {
  return statusBeforeComplete.get(statusKey(filePath, item.data.titleRaw));
}

export function getCurrentStatusOptions() {
  return getStatusOptions(getTasksStatusSettings(), getTaskStatusDone());
}
