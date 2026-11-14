# Kanban Z

**Kanban Z** is a fork of the [Obsidian Kanban plugin](https://github.com/mgmeyers/obsidian-kanban) by mgmeyers, which is no longer actively maintained (last upstream release: 2.0.51, May 2024).

- Plugin id: `kanban-z` (installs separately from the original `obsidian-kanban`, so upstream updates never overwrite it)
- Boards keep the same `kanban-plugin: board` frontmatter, so existing boards open unchanged. Enable only one of Kanban / Kanban Z at a time.
- Roadmap: stability fixes first, then follow-up tracking features (touchpoint logging, staleness indicators, subtask progress, alternate checkbox support).
- License: GPL-3.0, same as upstream.

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
