import { getDb } from '@/db/database';
import { archiveNameKey } from '@/services/archiveNames';
import { resolveComicPath, toStoredComicPath } from '@/services/paths';

import type { Comic, FitMode, ReadingDirection, SpreadHalf } from '@/types/comic';

type ComicRow = {
  id: string;
  title: string;
  series: string | null;
  sourceUri: string | null;
  sourceFileName: string | null;
  coverPath: string;
  pagesDir: string;
  pageCount: number;
  currentPage: number;
  spreadHalf: string;
  isRead: number;
  isFavorite: number;
  fitMode: string;
  readingDirection: string;
  lastReadAt: number | null;
  importedAt: number;
};

function rowArchiveKey(row: Pick<ComicRow, 'sourceFileName' | 'sourceUri'>): string {
  if (row.sourceFileName?.trim()) return archiveNameKey(row.sourceFileName);
  if (row.sourceUri) return archiveNameKey(row.sourceUri);
  return '';
}

/** Map a DB row to the app model; paths are resolved to current documentDirectory. */
function mapRow(row: ComicRow): Comic {
  return {
    id: row.id,
    title: row.title,
    series: row.series,
    sourceUri: row.sourceUri,
    sourceFileName: row.sourceFileName,
    // Legacy rows may still store absolute URIs — resolveComicPath rebases them.
    coverPath: resolveComicPath(row.coverPath),
    pagesDir: resolveComicPath(row.pagesDir),
    pageCount: row.pageCount,
    currentPage: row.currentPage,
    spreadHalf: row.spreadHalf as SpreadHalf,
    isRead: row.isRead === 1,
    isFavorite: row.isFavorite === 1,
    fitMode: row.fitMode as FitMode,
    readingDirection: row.readingDirection as ReadingDirection,
    lastReadAt: row.lastReadAt,
    importedAt: row.importedAt,
  };
}

export async function insertComic(comic: Comic): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO comics (
      id, title, series, sourceUri, sourceFileName, coverPath, pagesDir, pageCount, currentPage,
      spreadHalf, isRead, isFavorite, fitMode, readingDirection, lastReadAt, importedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      comic.id,
      comic.title,
      comic.series,
      comic.sourceUri,
      comic.sourceFileName,
      // Persist id-relative paths only (see paths.ts).
      toStoredComicPath(comic.coverPath),
      toStoredComicPath(comic.pagesDir),
      comic.pageCount,
      comic.currentPage,
      comic.spreadHalf,
      comic.isRead ? 1 : 0,
      comic.isFavorite ? 1 : 0,
      comic.fitMode,
      comic.readingDirection,
      comic.lastReadAt,
      comic.importedAt,
    ],
  );
}

export async function getAllComics(): Promise<Comic[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ComicRow>(
    'SELECT * FROM comics ORDER BY COALESCE(lastReadAt, importedAt) DESC',
  );
  return rows.map(mapRow);
}

export async function getComicById(id: string): Promise<Comic | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ComicRow>('SELECT * FROM comics WHERE id = ?', [id]);
  return row ? mapRow(row) : null;
}

/**
 * Case-insensitive filename match (JS-normalized). Same archive name from
 * another folder counts as already imported — intentional for this personal shelf.
 */
export async function findComicBySourceFileName(fileName: string): Promise<Comic | null> {
  const key = archiveNameKey(fileName);
  if (!key) return null;

  const db = await getDb();
  const rows = await db.getAllAsync<ComicRow>(
    `SELECT * FROM comics
     WHERE (sourceFileName IS NOT NULL AND trim(sourceFileName) != '')
        OR (sourceUri IS NOT NULL AND trim(sourceUri) != '')`,
  );
  for (const row of rows) {
    if (rowArchiveKey(row) === key) return mapRow(row);
  }
  return null;
}

/** All normalized archive name keys currently in the library (one query). */
export async function getImportedArchiveNameKeys(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<Pick<ComicRow, 'sourceFileName' | 'sourceUri'>>(
    'SELECT sourceFileName, sourceUri FROM comics',
  );
  const keys = new Set<string>();
  for (const row of rows) {
    const key = rowArchiveKey(row);
    if (key) keys.add(key);
  }
  return keys;
}

export async function updateComicProgress(
  id: string,
  currentPage: number,
  spreadHalf: SpreadHalf,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE comics SET currentPage = ?, spreadHalf = ?, lastReadAt = ? WHERE id = ?`,
    [currentPage, spreadHalf, Date.now(), id],
  );
}

export async function setComicRead(id: string, isRead: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE comics SET isRead = ? WHERE id = ?', [isRead ? 1 : 0, id]);
}

export async function setComicFavorite(id: string, isFavorite: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE comics SET isFavorite = ? WHERE id = ?', [isFavorite ? 1 : 0, id]);
}

/** After repair/re-extract: update page count + cover; clamp currentPage into range. */
export async function updateComicPageMetadata(
  id: string,
  pageCount: number,
  coverPath: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE comics SET pageCount = ?, coverPath = ?, currentPage = MIN(currentPage, ?) WHERE id = ?',
    [pageCount, toStoredComicPath(coverPath), Math.max(0, pageCount - 1), id],
  );
}

export async function getAllComicIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM comics');
  return rows.map((row) => row.id);
}

export async function deleteComicRow(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM comics WHERE id = ?', [id]);
}

export async function deleteAllComicRows(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM comics');
}
