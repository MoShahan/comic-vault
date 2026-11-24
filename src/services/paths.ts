import * as FileSystem from 'expo-file-system/legacy';

const COMICS_MARKER = '/comics/';

/** Absolute `documentDirectory/comics/` root (trailing slash). */
export function comicsRoot(): string {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('Document directory is unavailable.');
  return `${root}comics/`;
}

/**
 * Convert an absolute or legacy path into an id-relative path for SQLite
 * (e.g. `c_abc/pages/`, `c_abc/pages/page_0001.jpg`).
 * Survives iOS container UUID changes by stripping everything before `/comics/`.
 */
export function toStoredComicPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.indexOf(COMICS_MARKER);
  if (idx >= 0) {
    return normalized.slice(idx + COMICS_MARKER.length);
  }
  if (/^(file:|content:)/i.test(normalized)) {
    const parts = normalized.split('/').filter(Boolean);
    return parts[parts.length - 1] || normalized;
  }
  return normalized.replace(/^\//, '');
}

/** Resolve a stored (relative or legacy absolute) comic path to a current file URI. */
export function resolveComicPath(stored: string): string {
  if (!stored) return stored;
  return `${comicsRoot()}${toStoredComicPath(stored)}`;
}

/** Parent comic folder from a `.../pages/` directory URI. */
export function comicRootFromPagesDir(pagesDir: string): string {
  return pagesDir.replace(/pages\/?$/, '');
}
