import * as FileSystem from 'expo-file-system/legacy';

import { formatBytes } from '@/services/format';
import { comicsRoot } from '@/services/paths';

/** Cap bridge parallelism so huge page trees don’t flood native I/O. */
const SIZE_CONCURRENCY = 8;

/** Run async work over `items` with at most `concurrency` in flight. */
async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

async function entrySize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) return 0;
  if (!info.isDirectory) {
    return 'size' in info && typeof info.size === 'number' ? info.size : 0;
  }

  const children = await FileSystem.readDirectoryAsync(uri);
  const sizes = await mapPool(children, SIZE_CONCURRENCY, (name) => {
    const child = uri.endsWith('/') ? `${uri}${name}` : `${uri}/${name}`;
    return entrySize(child);
  });
  return sizes.reduce((sum, n) => sum + n, 0);
}

export async function getLibraryStorageStats(): Promise<{
  bytes: number;
  label: string;
  comicFolders: number;
}> {
  let comicsDir: string;
  try {
    comicsDir = comicsRoot();
  } catch {
    return { bytes: 0, label: '0 B', comicFolders: 0 };
  }
  const info = await FileSystem.getInfoAsync(comicsDir);
  if (!info.exists) {
    return { bytes: 0, label: '0 B', comicFolders: 0 };
  }

  const folders = await FileSystem.readDirectoryAsync(comicsDir);
  // Parallelize per comic folder — typical library shape is many mid-size trees.
  const sizes = await mapPool(folders, SIZE_CONCURRENCY, (name) =>
    entrySize(`${comicsDir}${name}`),
  );
  const bytes = sizes.reduce((sum, n) => sum + n, 0);
  return { bytes, label: formatBytes(bytes), comicFolders: folders.length };
}
