import { App, FuzzySuggestModal, Notice, TFile } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { Path } from 'src/dnd/types';
import { t } from 'src/lang/helpers';
import { frontmatterKey } from 'src/parsers/common';
import { itemToMd } from 'src/parsers/formats/list';

import { Board, Item } from '../components/types';
import { BoardModifiers } from './boardModifiers';
import { laneStatusRegEx, setItemMdStatus } from './itemStatus';

export interface BoardLaneTarget {
  file: TFile;
  boardName: string;
  laneTitle: string;
  laneIndex: number;
}

const laneMaxItemsRegEx = /\s*\(\d+\)$/;

/** Kanban lane headings in a board file, in order (stops at the Archive section). */
export function getLaneTitles(md: string): string[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const titles: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('%% kanban:settings')) break;
    if (line.trim() === '***') break; // archive marker
    if (line.startsWith('## ')) titles.push(line.slice(3).trim().replace(laneMaxItemsRegEx, ''));
  }

  return titles;
}

/**
 * Append a card (as markdown) to the end of a lane in a board file.
 * The lane is located by index and verified by title. Returns the new markdown,
 * or throws if the lane can't be found.
 */
export function insertItemMdIntoLane(
  md: string,
  laneIndex: number,
  laneTitle: string,
  itemMd: string
): string {
  const eol = md.includes('\r\n') ? '\r\n' : '\n';
  const lines = md.replace(/\r\n/g, '\n').split('\n');

  let headingLine = -1;
  let seen = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('%% kanban:settings') || line.trim() === '***') break;
    if (line.startsWith('## ')) {
      seen++;
      if (seen === laneIndex) {
        headingLine = i;
        break;
      }
    }
  }

  if (headingLine < 0) throw new Error(`Lane ${laneIndex + 1} not found`);

  const foundTitle = lines[headingLine].slice(3).trim().replace(laneMaxItemsRegEx, '');
  if (foundTitle !== laneTitle) {
    throw new Error(`Lane "${laneTitle}" has changed (found "${foundTitle}")`);
  }

  // Lane body runs until the next heading, archive marker, or settings block.
  let end = lines.length;
  for (let i = headingLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ') || line.trim() === '***' || line.startsWith('%% kanban:settings')) {
      end = i;
      break;
    }
  }

  // Insert after the last non-blank line of the lane body (last card or the
  // "**Complete**" marker), or right after the heading's blank line if empty.
  let insertAt = headingLine + 1;
  for (let i = end - 1; i > headingLine; i--) {
    if (lines[i].trim() !== '') {
      insertAt = i + 1;
      break;
    }
  }

  const newLines = itemMd.replace(/\r\n/g, '\n').split('\n');

  // Status lists (`**Status: ?**`) apply their status to cards moved in.
  for (let i = headingLine + 1; i < end; i++) {
    const marker = lines[i].trim().match(/^\*\*(.+)\*\*$/);
    const status = marker?.[1].match(laneStatusRegEx);
    if (status) {
      newLines[0] = setItemMdStatus(newLines[0], status[1]);
      break;
    }
  }

  if (insertAt === headingLine + 1) {
    // Empty lane: keep one blank line between heading and first card.
    lines.splice(insertAt, 0, '', ...newLines);
  } else {
    lines.splice(insertAt, 0, ...newLines);
  }

  return lines.join(eol);
}

/** All lanes of every Kanban board in the vault except the given file. */
export async function getOtherBoardLanes(
  app: App,
  excludePath: string
): Promise<BoardLaneTarget[]> {
  const targets: BoardLaneTarget[] = [];
  const files = app.vault
    .getMarkdownFiles()
    .filter(
      (f) =>
        f.path !== excludePath && !!app.metadataCache.getFileCache(f)?.frontmatter?.[frontmatterKey]
    )
    .sort((a, b) => a.basename.localeCompare(b.basename));

  for (const file of files) {
    const md = await app.vault.cachedRead(file);
    getLaneTitles(md).forEach((laneTitle, laneIndex) => {
      targets.push({ file, boardName: file.basename, laneTitle, laneIndex });
    });
  }

  return targets;
}

/** Current path of a card in a board, found by id (paths can go stale). */
export function findItemPath(board: Board, itemId: string): Path | null {
  for (let l = 0; l < board.children.length; l++) {
    const index = board.children[l].children.findIndex((i) => i.id === itemId);
    if (index > -1) return [l, index];
  }
  return null;
}

/** Write the card into the target board first, then remove it from this board. */
export async function moveItemToBoard(
  stateManager: StateManager,
  boardModifiers: BoardModifiers,
  item: Item,
  target: BoardLaneTarget
) {
  const md = itemToMd(item);

  try {
    await stateManager.app.vault.process(target.file, (data) =>
      insertItemMdIntoLane(data, target.laneIndex, target.laneTitle, md)
    );
  } catch (e) {
    console.error(e);
    new Notice(`${t('Could not move card')}: ${(e as Error).message}`);
    return;
  }

  const currentPath = findItemPath(stateManager.state, item.id);
  if (currentPath) {
    boardModifiers.deleteEntity(currentPath);
  } else {
    // The card changed while the picker was open; keep it rather than guess.
    new Notice(`${t('Could not move card')}: copied to ${target.boardName}, original kept`);
    return;
  }

  new Notice(`${t('Moved card to')} ${target.boardName} › ${target.laneTitle}`);
}

export class MoveToBoardModal extends FuzzySuggestModal<BoardLaneTarget> {
  constructor(
    app: App,
    private targets: BoardLaneTarget[],
    private onChoose: (target: BoardLaneTarget) => void
  ) {
    super(app);
    this.setPlaceholder(t('Move card to board and list...'));
  }

  getItems() {
    return this.targets;
  }

  getItemText(target: BoardLaneTarget) {
    return `${target.boardName} › ${target.laneTitle}`;
  }

  onChooseItem(target: BoardLaneTarget) {
    this.onChoose(target);
  }
}
