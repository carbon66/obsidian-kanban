# Kanban Z

**Kanban Z** is a fork of the [Obsidian Kanban plugin](https://github.com/mgmeyers/obsidian-kanban) by mgmeyers, which is no longer actively maintained (last upstream release: 2.0.51, May 2024).

- Plugin id: `kanban-z` (installs separately from the original `obsidian-kanban`, so upstream updates never overwrite it)
- Boards keep the same `kanban-plugin: board` frontmatter, so existing boards open unchanged. Enable only one of Kanban / Kanban Z at a time.
- Roadmap: stability fixes first, then follow-up tracking features (touchpoint logging, staleness indicators, subtask progress, alternate checkbox support).
- License: GPL-3.0, same as upstream.

### What's different from upstream

- **Card statuses** (2.1.0): right-click a card → **Set status** for `[/]` In progress, `[?]` Question, `[-]` Cancelled, `[D]` Event, and any statuses defined in the Tasks plugin. Alternate-checkbox themes/snippets now style card checkboxes.
- **Move to board...** (2.1.0): send a card (with its notes) to any list on another Kanban board.
- **Complete lanes remember status** (2.1.0): a `[?]` card dragged into a Complete list and back out returns as `[?]`. "Move to list" now applies Complete-list behavior too.
- **Stability fixes** (2.0.53 to 2.0.54): regional languages (#1248), stale search (#1246), Tasks done-status detection, archive order (#1243), date picker "today" (#1236), pop-out Settings dropdowns (#1247).

### Install

- **BRAT:** add `carbon66/obsidian-kanban` as a beta plugin.
- **Manual:** download `main.js`, `manifest.json`, and `styles.css` from the latest [release](https://github.com/carbon66/obsidian-kanban/releases) into `<vault>/.obsidian/plugins/kanban-z/`, then enable **Kanban Z** in Community plugins.

### Build

```bash
yarn install
yarn build
```

### Test

```bash
yarn test                     # parser round-trip, locale, search, and Tasks status tests
KANBAN_FIXTURES_DIR="<folder with boards>" yarn test   # also round-trip your own boards (read-only)
yarn dev-install              # copy the build into ./test-vault (gitignored, seeded with sample boards)
yarn dev-install "<vault>"    # copy the build into another vault
```

CI runs typecheck, tests, and build on every push and pull request.

---

*Original README follows.*

# Obsidian Kanban Plugin

---

Create markdown-backed Kanban boards in [Obsidian](https://obsidian.md/)

- [Bugs, Issues, & Feature Requests](https://github.com/mgmeyers/obsidian-kanban/issues)
- [Development Roadmap](https://github.com/mgmeyers/obsidian-kanban/projects/1)

![Screen Shot 2021-09-16 at 12.58.22 PM.png](https://github.com/mgmeyers/obsidian-kanban/blob/main/docs/Assets/Screen%20Shot%202021-09-16%20at%2012.58.22%20PM.png)

![Screen Shot 2021-09-16 at 1.10.38 PM.png](https://github.com/mgmeyers/obsidian-kanban/blob/main/docs/Assets/Screen%20Shot%202021-09-16%20at%201.10.38%20PM.png)

## Documentation

Find the plugin documentation here: [Obsidian Kanban Plugin Documentation](https://publish.obsidian.md/kanban/)
