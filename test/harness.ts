// Test harness: exposes the real Kanban parser/serializer with a lightweight
// StateManager stand-in. Bundled by esbuild in test/run-tests.mjs.
import { defaults as datePickerDefaults } from 'src/components/Editor/flatpickr/types/options';
import { maybeCompleteForMove } from 'src/components/helpers';
import { getBoardModifiers } from 'src/helpers/boardModifiers';
import { findItemPath, getLaneTitles, insertItemMdIntoLane } from 'src/helpers/crossBoard';
import { getStatusOptions, setItemStatus, stripDoneDate } from 'src/helpers/itemStatus';
import { resolveLocale } from 'src/lang/helpers';
import { ListFormat } from 'src/parsers/List';
import { boardToMd, itemToMd } from 'src/parsers/formats/list';
import {
  getTaskStatusDone,
  getTaskStatusPreDone,
  refreshTasksStatusSettings,
} from 'src/parsers/helpers/inlineMetadata';
import {
  bindChoicesToOwnerDocument,
  defaultDateTrigger,
  defaultMetadataPosition,
  defaultTimeTrigger,
} from 'src/settingHelpers';

export function createStateManager(globalSettings: Record<string, any> = {}) {
  const sm: any = {
    app: (globalThis as any).app,
    file: { path: 'test-board.md', basename: 'test-board' },
    state: null,
    compiledSettings: {},
    hasError: () => false,
    setError: (e: Error) => {
      throw e;
    },
    getGlobalSettings: () => globalSettings,
    getSetting(key: string) {
      const v = sm.compiledSettings[key];
      if (v !== undefined) return v;
      return globalSettings[key] ?? null;
    },
    compileSettings(settings: Record<string, any> = {}) {
      sm.compiledSettings = {
        'date-format': 'YYYY-MM-DD',
        'date-display-format': 'YYYY-MM-DD',
        'time-format': 'HH:mm',
        'date-trigger': defaultDateTrigger,
        'time-trigger': defaultTimeTrigger,
        'inline-metadata-position': defaultMetadataPosition,
        'date-colors': [],
        'tag-colors': [],
        'tag-sort': [],
        'metadata-keys': [],
        ...globalSettings,
        ...settings,
      };
    },
  };

  sm.parser = new ListFormat(sm);
  sm.getNewItem = (content: string, checkChar: string, forceEdit?: boolean) =>
    sm.parser.newItem(content, checkChar, forceEdit);
  sm.updateItemContent = (item: any, content: string) => sm.parser.updateItemContent(item, content);
  return sm;
}

/** Mirrors StateManager.getParsedBoard: trims, then parses. */
export function mdToBoard(sm: any, md: string) {
  return sm.parser.mdToBoard(md.trim());
}

/**
 * Board modifiers wired to the stand-in StateManager: setState applies the
 * updater synchronously, and the view stub ignores collapse-state bookkeeping.
 */
export function createBoardModifiers(sm: any) {
  sm.setState = (updater: any) => {
    sm.state = typeof updater === 'function' ? updater(sm.state) : updater;
  };
  const view: any = {
    getViewState: (): any[] => [],
    setViewState: (): void => undefined,
  };
  return getBoardModifiers(view, sm);
}

export {
  boardToMd,
  resolveLocale,
  getTaskStatusDone,
  getTaskStatusPreDone,
  refreshTasksStatusSettings,
  bindChoicesToOwnerDocument,
  datePickerDefaults,
  insertItemMdIntoLane,
  getLaneTitles,
  findItemPath,
  getStatusOptions,
  setItemStatus,
  stripDoneDate,
  maybeCompleteForMove,
  itemToMd,
};
