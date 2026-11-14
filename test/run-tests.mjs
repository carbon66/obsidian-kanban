// Kanban Z test runner.
//
//   yarn test                       run all tests against test/fixtures/*.md
//   KANBAN_FIXTURES_DIR=<dir> yarn test
//                                   also round-trip every board in <dir> (e.g. a
//                                   private copy of your real boards; never commit those)
//
// Bundles test/harness.ts (the real parser code) with esbuild, swaps the
// `obsidian` module for test/mocks/obsidian.cjs, then runs node:test suites.
import esbuild from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, '.test-build', 'harness.cjs');

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'test', 'harness.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile,
  external: ['obsidian'],
  // Browser-only UI packages that touch the DOM on import; not used by parser code.
  alias: { 'choices.js': './test/mocks/ui-stub.cjs' },
  loader: { '.css': 'empty', '.less': 'empty', '.styl': 'empty' },
  tsconfig: path.join(root, 'tsconfig.json'),
  logLevel: 'warning',
});

// ---- Minimal Obsidian runtime globals -------------------------------------
// Obsidian extends built-in prototypes; the plugin relies on these helpers.
const defineHelper = (proto, name, fn) => {
  if (!proto[name])
    Object.defineProperty(proto, name, { value: fn, configurable: true, writable: true });
};
defineHelper(Array.prototype, 'first', function () {
  return this[0];
});
defineHelper(Array.prototype, 'last', function () {
  return this[this.length - 1];
});
defineHelper(Array.prototype, 'contains', function (v) {
  return this.includes(v);
});
defineHelper(Array.prototype, 'remove', function (v) {
  const i = this.indexOf(v);
  if (i >= 0) this.splice(i, 1);
});
defineHelper(String.prototype, 'contains', function (v) {
  return this.includes(v);
});

const storage = new Map();
if (process.env.KANBAN_TEST_LANG) storage.set('language', process.env.KANBAN_TEST_LANG);

globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
globalThis.activeWindow = globalThis;
globalThis.app = {
  plugins: { enabledPlugins: new Set(), plugins: {} },
  internalPlugins: { plugins: { 'daily-notes': { instance: { options: {} } } } },
  metadataCache: { getFirstLinkpathDest: () => null, getFileCache: () => null },
  vault: { getConfig: (key) => (key === 'useTab' ? !!globalThis.__kanbanUseTab : undefined) },
  workspace: { editorSuggest: { suggests: [] } },
};

const mockPath = path.join(root, 'test', 'mocks', 'obsidian.cjs');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'obsidian') return mockPath;
  return originalResolve.call(this, request, ...rest);
};

const require = Module.createRequire(import.meta.url);
const h = require(outfile);

// ---- Helpers ---------------------------------------------------------------
const norm = (s) => s.replace(/\r\n/g, '\n');

/** Card/lane region: from the first lane heading up to the settings block. */
function cardRegion(md) {
  const s = norm(md);
  const start = s.search(/^## /m);
  const end = s.indexOf('%% kanban:settings');
  return s.slice(start < 0 ? 0 : start, end < 0 ? s.length : end);
}

/** Ignore only blank-line run lengths and trailing whitespace, never content. */
const loose = (s) =>
  s
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{2,}/g, '\n\n')
    .trim();

function settingsOf(md) {
  const m = norm(md).match(/%% kanban:settings\n```\n([\s\S]*?)\n```\n%%/);
  return m ? JSON.parse(m[1]) : null;
}

function summarize(board) {
  return {
    lanes: board.children.map((lane) => ({
      title: lane.data.title,
      maxItems: lane.data.maxItems,
      complete: !!lane.data.shouldMarkItemsComplete,
      items: lane.children.map((i) => `[${i.data.checkChar}] ${i.data.titleRaw}`),
    })),
    archive: board.data.archive.map((i) => `[${i.data.checkChar}] ${i.data.titleRaw}`),
    frontmatter: board.data.frontmatter,
  };
}

function roundTrip(md) {
  const board1 = h.mdToBoard(h.createStateManager(), md);
  const out1 = h.boardToMd(board1);
  const board2 = h.mdToBoard(h.createStateManager(), out1);
  const out2 = h.boardToMd(board2);
  return { board1, out1, board2, out2 };
}

function fixtureFiles() {
  const dirs = [path.join(root, 'test', 'fixtures')];
  if (process.env.KANBAN_FIXTURES_DIR) dirs.push(path.resolve(process.env.KANBAN_FIXTURES_DIR));
  return dirs.flatMap((d) =>
    fs
      .readdirSync(d)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(d, f))
      .filter((f) => /^---[\s\S]*?kanban-plugin:/m.test(fs.readFileSync(f, 'utf8')))
  );
}

// ---- Suites ----------------------------------------------------------------
describe('round trip: markdown -> board -> markdown', () => {
  for (const file of fixtureFiles()) {
    const name = path.basename(file);
    const md = fs.readFileSync(file, 'utf8');

    test(`${name}: card text is preserved exactly`, () => {
      const { out1 } = roundTrip(md);
      assert.equal(loose(cardRegion(out1)), loose(cardRegion(md)));
    });

    test(`${name}: board settings are preserved`, () => {
      const { out1 } = roundTrip(md);
      assert.deepEqual(settingsOf(out1), settingsOf(md));
    });

    test(`${name}: serialization is stable (second save is byte-identical)`, () => {
      const { out1, out2, board1, board2 } = roundTrip(md);
      assert.deepEqual(summarize(board2), summarize(board1));
      assert.equal(out2, out1);
    });
  }

  test('tab-indented vaults keep multi-line cards intact', () => {
    globalThis.__kanbanUseTab = true;
    try {
      const md = fs
        .readFileSync(path.join(root, 'test', 'fixtures', 'basic-board.md'), 'utf8')
        .replace(/\n {4}/g, '\n\t');
      const { out1 } = roundTrip(md);
      assert.equal(loose(cardRegion(out1)), loose(cardRegion(md)));
    } finally {
      globalThis.__kanbanUseTab = false;
    }
  });
});

describe('locale resolution (#1248)', () => {
  const en = h.resolveLocale('en');

  test('exact codes resolve', () => {
    assert.ok(en);
    assert.ok(h.resolveLocale('de'));
    assert.ok(h.resolveLocale('pt-BR'));
    assert.ok(h.resolveLocale('zh-TW'));
  });

  test('regional variants fall back to the base language', () => {
    assert.equal(h.resolveLocale('en-GB'), en);
    assert.equal(h.resolveLocale('en-US'), en);
    assert.equal(h.resolveLocale('de-AT'), h.resolveLocale('de'));
    assert.equal(h.resolveLocale('pt-PT'), h.resolveLocale('pt'));
    assert.equal(h.resolveLocale('zh-CN'), h.resolveLocale('zh'));
  });

  test('matching is case-insensitive and accepts underscores', () => {
    assert.equal(h.resolveLocale('pt-br'), h.resolveLocale('pt-BR'));
    assert.equal(h.resolveLocale('en_GB'), en);
  });

  test('Ukrainian no longer loads the Turkish strings', () => {
    assert.notEqual(h.resolveLocale('uk'), h.resolveLocale('tr'));
  });

  test('missing or unknown languages fall back to English', () => {
    assert.equal(h.resolveLocale(null), en);
    assert.equal(h.resolveLocale(''), en);
    assert.equal(h.resolveLocale('xx-YY'), en);
  });
});

describe('search index after re-parse (#1246)', () => {
  const lines = (n) =>
    Array.from({ length: n }, (_, i) => `- [ ] Card number ${i} keyword${i}`).join('\n');
  const board = (cards) =>
    `---\n\nkanban-plugin: board\n\n---\n\n## Lane\n\n${cards}\n\n\n\n%% kanban:settings\n\`\`\`\n{"kanban-plugin":"board"}\n\`\`\`\n%%`;

  test('every card searches by its own text after a card is inserted above it', () => {
    const sm = h.createStateManager();
    sm.state = h.mdToBoard(sm, board(lines(20)));

    const updated = h.mdToBoard(sm, board(`- [ ] Brand new card newkeyword\n${lines(20)}`));

    for (const item of updated.children[0].children) {
      const own = item.data.titleRaw.match(/(new)?keyword\d*/)[0];
      assert.ok(
        item.data.titleSearch.includes(own),
        `"${item.data.titleRaw}" has stale search text "${item.data.titleSearch}"`
      );
    }
  });
});

describe('Tasks plugin status detection (Complete lanes)', () => {
  // Statuses where "done" is a custom symbol, so a fallback to 'x' is detectable.
  const statusSettings = {
    coreStatuses: [
      { symbol: ' ', name: 'Todo', nextStatusSymbol: 'D', type: 'TODO' },
      { symbol: 'D', name: 'Done', nextStatusSymbol: ' ', type: 'DONE' },
    ],
    customStatuses: [
      { symbol: '/', name: 'In Progress', nextStatusSymbol: 'D', type: 'IN_PROGRESS' },
    ],
  };

  const withTasks = async ({ live, saved }, fn) => {
    const a = globalThis.app;
    const prev = { suggests: a.workspace.editorSuggest.suggests, plugins: a.plugins };
    a.plugins = {
      enabledPlugins: new Set(['obsidian-tasks-plugin']),
      plugins: { 'obsidian-tasks-plugin': { loadData: async () => saved } },
    };
    a.workspace.editorSuggest.suggests = live
      ? [{ settings: { taskFormat: 'tasksPluginEmoji', statusSettings: live } }]
      : [];
    try {
      await h.refreshTasksStatusSettings();
      await fn();
    } finally {
      a.workspace.editorSuggest.suggests = prev.suggests;
      a.plugins = prev.plugins;
      await h.refreshTasksStatusSettings();
    }
  };

  test("defaults to 'x' / ' ' without the Tasks plugin", async () => {
    await h.refreshTasksStatusSettings();
    assert.equal(h.getTaskStatusDone(), 'x');
    assert.equal(h.getTaskStatusPreDone(), ' ');
  });

  test('uses live Tasks settings when the suggester is available', async () => {
    await withTasks({ live: statusSettings, saved: null }, () => {
      assert.equal(h.getTaskStatusDone(), 'D');
    });
  });

  test("falls back to Tasks' saved settings when auto-suggest is off", async () => {
    await withTasks({ live: null, saved: { statusSettings } }, () => {
      assert.equal(h.getTaskStatusDone(), 'D');
      assert.equal(h.getTaskStatusPreDone(), ' ');
    });
  });
});
