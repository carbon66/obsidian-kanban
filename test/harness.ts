// Test harness: exposes the real Kanban parser/serializer with a lightweight
// StateManager stand-in. Bundled by esbuild in test/run-tests.mjs.
import { resolveLocale } from 'src/lang/helpers';
import { ListFormat } from 'src/parsers/List';
import { boardToMd } from 'src/parsers/formats/list';
import {
  getTaskStatusDone,
  getTaskStatusPreDone,
  refreshTasksStatusSettings,
} from 'src/parsers/helpers/inlineMetadata';
import {
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
  return sm;
}

/** Mirrors StateManager.getParsedBoard: trims, then parses. */
export function mdToBoard(sm: any, md: string) {
  return sm.parser.mdToBoard(md.trim());
}

export {
  boardToMd,
  resolveLocale,
  getTaskStatusDone,
  getTaskStatusPreDone,
  refreshTasksStatusSettings,
};
