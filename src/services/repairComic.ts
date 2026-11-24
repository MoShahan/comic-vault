import * as FileSystem from 'expo-file-system/legacy';

import { getComicById, updateComicPageMetadata } from '@/db/comicRepository';
import { extractCbzToDirectory, listPageFiles } from '@/services/extractCbz';
import { comicSandboxDir } from '@/services/paths';
import { clearSpreadFlagsCache } from '@/services/spreadFlags';

/** Prevents overlapping repairs on the same comic (detail double-tap). */
const repairingIds = new Set<string>();

async function finalizePagesDir(
  id: string,
  pagesDir: string,
): Promise<{ pageCount: number }> {
  const pages = await listPageFiles(pagesDir);
  if (pages.length === 0) {
    throw new Error('Repair produced no readable pages.');
  }
  await updateComicPageMetadata(id, pages.length, pages[0]);
  return { pageCount: pages.length };
}

/**
 * Re-extract pages from the stored `source.cbz` if present, else rebuild the
 * page list from whatever is already on disk.
 *
 * Extract always lands in `pages_tmp/` and only swaps over `pages/` after
 * success — a failed repair must not delete the user's readable pages.
 */
export async function repairComic(id: string): Promise<{ pageCount: number }> {
  if (repairingIds.has(id)) {
    throw new Error('Repair already in progress.');
  }
  repairingIds.add(id);

  try {
    const comic = await getComicById(id);
    if (!comic) throw new Error('Comic not found');

    const root = comicSandboxDir(comic.id);
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
      await clearSpreadFlagsCache(comic.pagesDir);
      return finalizePagesDir(id, comic.pagesDir);
    }

    const pages = await listPageFiles(comic.pagesDir);
    if (pages.length === 0) {
      throw new Error('No pages found. Re-import this comic.');
    }
    await updateComicPageMetadata(id, pages.length, pages[0]);
    return { pageCount: pages.length };
  } finally {
    repairingIds.delete(id);
  }
}
