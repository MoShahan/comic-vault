import * as FileSystem from 'expo-file-system/legacy';

import { getAllComicIds } from '@/db/comicRepository';
import { comicsRoot } from '@/services/paths';

/** Disk folder names under `comics/` with no matching library row. */
export function orphanFolderNames(diskNames: string[], knownIds: ReadonlySet<string>): string[] {
  return diskNames.filter((name) => name.length > 0 && !knownIds.has(name));
}

/**
 * Delete `comics/<id>/` folders left behind when the app was killed mid-import
 * (folder on disk, no SQLite row). Best-effort; safe to call at startup.
 */
export async function purgeOrphanComicFolders(): Promise<number> {
  let root: string;
  try {
    root = comicsRoot();
  } catch {
    return 0;
  }

  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists) return 0;

  const knownIds = new Set(await getAllComicIds());
  const entries = await FileSystem.readDirectoryAsync(root);
  const orphans = orphanFolderNames(entries, knownIds);

  let purged = 0;
  for (const name of orphans) {
    const path = `${root}${name}`;
    try {
      const child = await FileSystem.getInfoAsync(path);
      if (!child.exists) continue;
      await FileSystem.deleteAsync(path, { idempotent: true });
      purged += 1;
    } catch {
      // Skip stubborn entries; next launch can retry.
    }
  }
  return purged;
}
