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

describe('archive order (#1243)', () => {
  const md = [
    '---',
    '',
    'kanban-plugin: board',
    '',
    '---',
    '',
    '## One',
    '',
    '- [ ] A1',
    '- [ ] A2',
    '',
    '',
    '',
    '## Two',
    '',
    '- [ ] B1',
    '- [ ] B2',
    '',
    '',
    '',
    '## Three',
    '',
    '- [ ] C1',
    '',
    '',
    '',
    '%% kanban:settings',
    '```',
    '{"kanban-plugin":"board"}',
    '```',
    '%%',
  ].join('\n');

  const archiveTitles = (sm) => sm.state.data.archive.map((i) => i.data.titleRaw);

  test('every archive action appends to the bottom, in the order performed', () => {
    const sm = h.createStateManager();
    sm.state = h.mdToBoard(sm, md);
    const mods = h.createBoardModifiers(sm);

    mods.archiveItem([0, 0]); // A1 (single card)
    mods.archiveLaneItems([1]); // B1, B2 (lane cards)
    mods.archiveItem([0, 0]); // A2 (single card)
    mods.archiveLane([2]); // C1 (whole lane)

    assert.deepEqual(archiveTitles(sm), ['A1', 'B1', 'B2', 'A2', 'C1']);
  });

  test('archive order survives a save and reload', () => {
    const sm = h.createStateManager();
    sm.state = h.mdToBoard(sm, md);
    const mods = h.createBoardModifiers(sm);
    mods.archiveItem([0, 0]);
    mods.archiveLaneItems([1]);

    const reloaded = h.mdToBoard(h.createStateManager(), h.boardToMd(sm.state));
    assert.deepEqual(
      reloaded.data.archive.map((i) => i.data.titleRaw),
      ['A1', 'B1', 'B2']
    );
  });
});

describe('date picker "today" (#1236)', () => {
  test('each picker gets the current time, not the plugin load time', async () => {
    const first = { ...h.datePickerDefaults }.now.getTime();
    await new Promise((r) => setTimeout(r, 15));
    const second = { ...h.datePickerDefaults }.now.getTime();
    assert.ok(second > first, `expected a fresh date, got ${first} then ${second}`);
  });
});

describe('settings dropdowns in a pop-out window (#1247)', () => {
  const fakeTarget = () => {
    const calls = [];
    return {
      calls,
      addEventListener: (type, fn) => calls.push(['add', type, fn]),
      removeEventListener: (type, fn) => calls.push(['remove', type, fn]),
    };
  };
  const fakeChoices = () => ({ _onClick() {}, _onTouchEnd() {}, _onTouchMove() {} });

  test('listeners are mirrored onto a separate window document and removed on cleanup', () => {
    const prevDocument = globalThis.document;
    globalThis.document = { documentElement: fakeTarget() };
    try {
      const popoutRoot = fakeTarget();
      const choices = fakeChoices();
      const cleanup = h.bindChoicesToOwnerDocument(choices, {
        ownerDocument: { documentElement: popoutRoot },
      });

      const added = popoutRoot.calls.filter((c) => c[0] === 'add');
      assert.deepEqual(added.map((c) => c[1]).sort(), ['click', 'touchend', 'touchmove']);
      assert.equal(added.find((c) => c[1] === 'click')[2], choices._onClick);

      cleanup();
      const removed = popoutRoot.calls.filter((c) => c[0] === 'remove');
      assert.deepEqual(removed.map((c) => c[1]).sort(), ['click', 'touchend', 'touchmove']);
    } finally {
      globalThis.document = prevDocument;
    }
  });

  test('does nothing in the main window (Choices already handles it)', () => {
    const prevDocument = globalThis.document;
    const mainRoot = fakeTarget();
    globalThis.document = { documentElement: mainRoot };
    try {
      h.bindChoicesToOwnerDocument(fakeChoices(), { ownerDocument: globalThis.document })();
      assert.equal(mainRoot.calls.length, 0);
    } finally {
      globalThis.document = prevDocument;
    }
  });
});

// ---- 2.1.0 features ---------------------------------------------------------
const featureBoard = [
  '---',
  '',
  'kanban-plugin: board',
  '',
  '---',
  '',
  '## To Discuss',
  '',
  '- [?] Ask John about routing ➕ 2026-11-03',
  '- [ ] Second card',
  '',
  '',
  '',
  '## Waiting (5)',
  '',
  '',
  '',
  '',
  '## Closed',
  '',
  '**Complete**',
  '- [x] Old card ✅ 2026-11-01',
  '',
  '',
  '',
  '***',
  '',
  '## Archive',
  '',
  '- [x] Archived ✅ 2026-10-01',
  '',
  '%% kanban:settings',
  '```',
  '{"kanban-plugin":"board"}',
  '```',
  '%%',
].join('\n');

const lanesOf = (md) =>
  h.mdToBoard(h.createStateManager(), md).children.map((l) => ({
    title: l.data.title,
    items: l.children.map((i) => `[${i.data.checkChar}] ${i.data.titleRaw}`),
  }));

describe('move card to another board (F2)', () => {
  test('lane titles are read in order, ignoring max-items suffix and the archive', () => {
    assert.deepEqual(h.getLaneTitles(featureBoard), ['To Discuss', 'Waiting', 'Closed']);
  });

  test('appends to the end of a lane that already has cards', () => {
    const out = h.insertItemMdIntoLane(featureBoard, 0, 'To Discuss', '- [ ] Moved card');
    assert.deepEqual(lanesOf(out)[0].items, [
      '[?] Ask John about routing ➕ 2026-11-03',
      '[ ] Second card',
      '[ ] Moved card',
    ]);
  });

  test('inserts into an empty lane (with a max-items limit in its heading)', () => {
    const out = h.insertItemMdIntoLane(featureBoard, 1, 'Waiting', '- [/] Moved card');
    const lanes = lanesOf(out);
    assert.deepEqual(lanes[1].items, ['[/] Moved card']);
    assert.equal(lanes[0].items.length, 2);
    assert.equal(lanes[2].items.length, 1);
  });

  test('inserts after existing cards in a Complete lane and leaves the archive alone', () => {
    const out = h.insertItemMdIntoLane(featureBoard, 2, 'Closed', '- [x] Moved ✅ 2026-11-14');
    const board = h.mdToBoard(h.createStateManager(), out);
    assert.deepEqual(
      board.children[2].children.map((i) => i.data.titleRaw),
      ['Old card ✅ 2026-11-01', 'Moved ✅ 2026-11-14']
    );
    assert.equal(board.children[2].data.shouldMarkItemsComplete, true);
    assert.deepEqual(
      board.data.archive.map((i) => i.data.titleRaw),
      ['Archived ✅ 2026-10-01']
    );
  });

  test('multi-line cards keep their notes', () => {
    const sm = h.createStateManager();
    const source = h.mdToBoard(
      sm,
      featureBoard.replace(
        '- [ ] Second card',
        '- [ ] Second card\n    - 2026-11-14: touchpoint note\n    - [ ] sub-step'
      )
    );
    const md = h.itemToMd(source.children[0].children[1]);
    const out = h.insertItemMdIntoLane(featureBoard, 1, 'Waiting', md);
    assert.deepEqual(lanesOf(out)[1].items, [
      '[ ] Second card\n- 2026-11-14: touchpoint note\n- [ ] sub-step',
    ]);
  });

  test('Windows line endings are preserved', () => {
    const crlf = featureBoard.replace(/\n/g, '\r\n');
    const out = h.insertItemMdIntoLane(crlf, 0, 'To Discuss', '- [ ] Moved card');
    assert.ok(!/[^\r]\n/.test(out), 'found a bare \\n');
  });

  test('refuses to write if the lane was renamed since the picker opened', () => {
    assert.throws(() => h.insertItemMdIntoLane(featureBoard, 0, 'Old Name', '- [ ] x'), /changed/);
    assert.throws(() => h.insertItemMdIntoLane(featureBoard, 9, 'Nope', '- [ ] x'), /not found/);
  });

  test('cards are located by id, not by a possibly stale path', () => {
    const board = h.mdToBoard(h.createStateManager(), featureBoard);
    const id = board.children[0].children[1].id;
    assert.deepEqual(h.findItemPath(board, id), [0, 1]);
    assert.equal(h.findItemPath(board, 'missing'), null);
  });
});

describe('card statuses (F1)', () => {
  test('status menu merges Tasks statuses and lists Done last', () => {
    const options = h.getStatusOptions(
      {
        coreStatuses: [{ symbol: 'x', name: 'Done' }],
        customStatuses: [{ symbol: '>', name: 'Moved to Board' }],
      },
      'x'
    );
    assert.equal(options.at(-1).symbol, 'x');
    assert.equal(options.find((o) => o.symbol === '>').name, 'Moved to Board');
    assert.ok(options.some((o) => o.symbol === '?'));
    assert.equal(new Set(options.map((o) => o.symbol)).size, options.length);
  });

  test('done dates are stripped from the first line only', () => {
    assert.equal(
      h.stripDoneDate('Card ➕ 2026-11-03 ✅ 2026-11-14\n    - note ✅ 2026-01-01'),
      'Card ➕ 2026-11-03\n    - note ✅ 2026-01-01'
    );
  });

  test('setting a status rewrites the checkbox and keeps the text', () => {
    const sm = h.createStateManager();
    const board = h.mdToBoard(sm, featureBoard);
    const [next] = h.setItemStatus(sm, board.children[0].children[1], '/');
    assert.equal(next.data.checkChar, '/');
    assert.equal(next.data.titleRaw, 'Second card');
  });

  test('moving a card out of Done removes its done date', () => {
    const sm = h.createStateManager();
    const board = h.mdToBoard(sm, featureBoard);
    const [next] = h.setItemStatus(sm, board.children[2].children[0], '?');
    assert.equal(next.data.checkChar, '?');
    assert.equal(next.data.titleRaw, 'Old card');
  });
});

describe('Complete lanes keep the previous status (F3)', () => {
  test('a [?] card dragged into Closed and back out is [?] again', () => {
    const sm = h.createStateManager();
    const board = h.mdToBoard(sm, featureBoard);
    const card = board.children[0].children[0]; // [?]

    const intoClosed = h.maybeCompleteForMove(sm, board, [0, 0], sm, board, [2, 0], card).next;
    assert.equal(intoClosed.data.checkChar, 'x');

    const backOut = h.maybeCompleteForMove(sm, board, [2, 0], sm, board, [0, 0], intoClosed).next;
    assert.equal(backOut.data.checkChar, '?');
    assert.equal(backOut.data.checked, true);
  });

  test('a plain [ ] card still comes back as [ ]', () => {
    const sm = h.createStateManager();
    const board = h.mdToBoard(sm, featureBoard);
    const card = board.children[0].children[1]; // [ ]

    const intoClosed = h.maybeCompleteForMove(sm, board, [0, 1], sm, board, [2, 0], card).next;
    const backOut = h.maybeCompleteForMove(sm, board, [2, 0], sm, board, [0, 0], intoClosed).next;
    assert.equal(backOut.data.checkChar, ' ');
  });

  test('a card that was already done does not pick up a stale status', () => {
    const sm = h.createStateManager();
    const board = h.mdToBoard(sm, featureBoard);
    const done = board.children[2].children[0]; // [x] in Closed

    const out = h.maybeCompleteForMove(sm, board, [2, 0], sm, board, [0, 0], done).next;
    assert.equal(out.data.checkChar, ' ');
  });
});

describe('status lists: cards moved in get the list status', () => {
  const fixture = fs.readFileSync(
    path.join(root, 'test', 'fixtures', 'status-lane-board.md'),
    'utf8'
  );
  const load = () => {
    const sm = h.createStateManager();
    return { sm, board: h.mdToBoard(sm, fixture) };
  };
  const move = (sm, board, from, to, card) =>
    h.maybeCompleteForMove(sm, board, from, sm, board, to, card).next;

  test('the **Status: ?** marker is read and written back', () => {
    const { board } = load();
    assert.equal(board.children[1].data.autoStatus, '?');
    assert.equal(board.children[2].data.autoStatus, '?');
    assert.equal(board.children[0].data.autoStatus, undefined);
    assert.ok(
      h.boardToMd(board).includes('## 🔍 Verify & Follow-Up\n\n**Status: ?**\n- [?] Confirm')
    );
  });

  test('a [ ] card moved into Follow-Up becomes [?], and [ ] again when moved back', () => {
    const { sm, board } = load();
    const card = board.children[0].children[0];
    const inFollowUp = move(sm, board, [0, 0], [1, 0], card);
    assert.equal(inFollowUp.data.checkChar, '?');
    assert.equal(inFollowUp.data.titleRaw, card.data.titleRaw);

    const back = move(sm, board, [1, 0], [0, 0], inFollowUp);
    assert.equal(back.data.checkChar, ' ');
  });

  test('a [/] card moved into Follow-Up and back returns as [/]', () => {
    const { sm, board } = load();
    const card = board.children[0].children[1];
    const inFollowUp = move(sm, board, [0, 1], [1, 0], card);
    assert.equal(inFollowUp.data.checkChar, '?');
    assert.equal(move(sm, board, [1, 0], [0, 0], inFollowUp).data.checkChar, '/');
  });

  test('a status changed by hand inside Follow-Up is kept when the card leaves', () => {
    const { sm, board } = load();
    const [changed] = h.setItemStatus(sm, board.children[1].children[0], '!');
    assert.equal(move(sm, board, [1, 0], [0, 0], changed).data.checkChar, '!');
  });

  test('reordering within Follow-Up does not touch the status', () => {
    const { sm, board } = load();
    const [changed] = h.setItemStatus(sm, board.children[1].children[0], '/');
    assert.equal(move(sm, board, [1, 0], [1, 1], changed).data.checkChar, '/');
  });

  test('Follow-Up -> Closed -> Follow-Up ends as [?]', () => {
    const { sm, board } = load();
    const card = board.children[1].children[0];
    const closed = move(sm, board, [1, 0], [3, 0], card);
    assert.equal(closed.data.checkChar, 'x');
    assert.equal(move(sm, board, [3, 0], [1, 0], closed).data.checkChar, '?');
  });

  test('a done card moved into Follow-Up becomes [?] without its done date', () => {
    const { sm, board } = load();
    const done = board.children[3].children[0];
    const out = move(sm, board, [3, 0], [1, 0], done);
    assert.equal(out.data.checkChar, '?');
    assert.equal(out.data.titleRaw, 'Done card');
  });

  test('Move to board into a status list applies the status', () => {
    const out = h.insertItemMdIntoLane(fixture, 2, 'Empty Follow-Up', '- [ ] From another board');
    const board = h.mdToBoard(h.createStateManager(), out);
    assert.deepEqual(
      board.children[2].children.map((i) => `[${i.data.checkChar}] ${i.data.titleRaw}`),
      ['[?] From another board']
    );
    assert.equal(board.children[2].data.autoStatus, '?');
  });
});
