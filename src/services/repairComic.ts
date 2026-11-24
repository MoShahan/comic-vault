import * as FileSystem from 'expo-file-system/legacy';

import { getComicById } from '@/db/comicRepository';
import { getDb } from '@/db/database';
import { extractCbzToDirectory, listPageFiles } from '@/services/extractCbz';
import { comicRootFromPagesDir } from '@/services/paths';

const repairingIds = new Set<string>();

async function updatePageMetadata(
  id: string,
  pageCount: number,
  coverPath: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE comics SET pageCount = ?, coverPath = ?, currentPage = MIN(currentPage, ?) WHERE id = ?',
    [pageCount, coverPath, Math.max(0, pageCount - 1), id],
  );
}

async function finalizePagesDir(
  id: string,
  pagesDir: string,
): Promise<{ pageCount: number }> {
  const pages = await listPageFiles(pagesDir);
  if (pages.length === 0) {
    throw new Error('Repair produced no readable pages.');
  }
  await updatePageMetadata(id, pages.length, pages[0]);
  return { pageCount: pages.length };
}

/**
 * Re-extract pages from a stored archive copy if present, or rebuild page list from disk.
 * Archive extract goes to a temp folder and swaps in only after success so a failed
 * repair cannot wipe the existing pages.
 */
export async function repairComic(id: string): Promise<{ pageCount: number }> {
  if (repairingIds.has(id)) {
    throw new Error('Repair already in progress.');
  }
  repairingIds.add(id);

  try {
    const comic = await getComicById(id);
    if (!comic) throw new Error('Comic not found');

    const root = comicRootFromPagesDir(comic.pagesDir);
    const archivePath = `${root}source.cbz`;
    const tempPagesDir = `${root}pages_tmp/`;
    const archiveInfo = await FileSystem.getInfoAsync(archivePath);

    if (archiveInfo.exists) {
      const pagesInfo = await FileSystem.getInfoAsync(comic.pagesDir);
      const tempInfo = await FileSystem.getInfoAsync(tempPagesDir);

      // Recover a previous run that extracted successfully but failed mid-swap.
      if (tempInfo.exists && !pagesInfo.exists) {
        await FileSystem.moveAsync({ from: tempPagesDir, to: comic.pagesDir });
        return finalizePagesDir(id, comic.pagesDir);
      }

      await FileSystem.deleteAsync(tempPagesDir, { idempotent: true });

      try {
        const extracted = await extractCbzToDirectory(archivePath, tempPagesDir);
        if (extracted.length === 0) {
          throw new Error('No images found in the stored archive.');
        }
      } catch (error) {
        // Extract failed — keep the original pagesDir untouched.
        await FileSystem.deleteAsync(tempPagesDir, { idempotent: true }).catch(
          () => undefined,
        );
        throw error;
      }

      // Extract succeeded. Swap: only now remove the old pages.
      await FileSystem.deleteAsync(comic.pagesDir, { idempotent: true });
      await FileSystem.moveAsync({ from: tempPagesDir, to: comic.pagesDir });
      return finalizePagesDir(id, comic.pagesDir);
    }

    const pages = await listPageFiles(comic.pagesDir);
    if (pages.length === 0) {
      throw new Error('No pages found. Re-import this comic.');
    }
    await updatePageMetadata(id, pages.length, pages[0]);
    return { pageCount: pages.length };
  } finally {
    repairingIds.delete(id);
  }
}
