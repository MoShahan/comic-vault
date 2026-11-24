import { Image as RNImage } from 'react-native';

import * as FileSystem from 'expo-file-system/legacy';

import { isSpreadImage } from '@/library/selectors';
import { comicRootFromPagesDir } from '@/services/paths';

const PROBE_CONCURRENCY = 4;

type SpreadFlagsCache = {
  pageCount: number;
  flags: boolean[];
};

function cachePathForPagesDir(pagesDir: string): string {
  return `${comicRootFromPagesDir(pagesDir)}spread_flags.json`;
}

function probeSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    RNImage.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 1, height: 1 }),
    );
  });
}

/** Probe page sizes with a fixed concurrency cap to avoid decoding every page at once. */
async function probeSpreadFlagsBatched(pageUris: string[]): Promise<boolean[]> {
  const flags = new Array<boolean>(pageUris.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < pageUris.length) {
      const index = next;
      next += 1;
      const size = await probeSize(pageUris[index]);
      flags[index] = isSpreadImage(size.width, size.height);
    }
  }

  const workers = Array.from(
    { length: Math.min(PROBE_CONCURRENCY, pageUris.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return flags;
}

async function readCache(path: string, pageCount: number): Promise<boolean[] | null> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw) as SpreadFlagsCache;
    if (
      parsed &&
      parsed.pageCount === pageCount &&
      Array.isArray(parsed.flags) &&
      parsed.flags.length === pageCount &&
      parsed.flags.every((f) => typeof f === 'boolean')
    ) {
      return parsed.flags;
    }
  } catch {
    // Corrupt or unreadable cache — fall through to probe.
  }
  return null;
}

async function writeCache(path: string, flags: boolean[]): Promise<void> {
  try {
    const payload: SpreadFlagsCache = { pageCount: flags.length, flags };
    await FileSystem.writeAsStringAsync(path, JSON.stringify(payload));
  } catch {
    // Cache is best-effort; probing still succeeded.
  }
}

/**
 * Return per-page spread flags for a comic. Uses a sidecar cache under the comic
 * folder so re-opens skip Image.getSize. First open probes in small batches.
 */
export async function loadOrProbeSpreadFlags(
  pagesDir: string,
  pageUris: string[],
): Promise<boolean[]> {
  if (pageUris.length === 0) return [];

  const path = cachePathForPagesDir(pagesDir);
  const cached = await readCache(path, pageUris.length);
  if (cached) return cached;

  const flags = await probeSpreadFlagsBatched(pageUris);
  await writeCache(path, flags);
  return flags;
}

/** Drop cached flags after repair / re-extract so the next open re-probes. */
export async function clearSpreadFlagsCache(pagesDir: string): Promise<void> {
  const path = cachePathForPagesDir(pagesDir);
  await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
}
