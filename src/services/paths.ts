import * as FileSystem from 'expo-file-system/legacy';

/**
 * Sandbox path helpers for extracted comics.
 *
 * SQLite stores id-relative paths under `comics/` (survives iOS container UUID
 * changes). Call sites resolve to absolute `file://` URIs at runtime via
 * `resolveComicPath`. Deletes must go through `comicSandboxDir` so we never
 * recursively remove anything outside a single `comics/<id>/` folder.
 */
const COMICS_MARKER = '/comics/';

function withTrailingSlash(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

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
  const normalized = withTrailingSlash(pagesDir);
  if (/\/pages\/$/.test(normalized)) {
    return normalized.replace(/\/pages\/$/, '/');
  }
  // Fallback: first segment under comics/ (id folder).
  const relative = toStoredComicPath(normalized);
  const id = relative.split('/').filter(Boolean)[0];
  if (id) return `${comicsRoot()}${id}/`;
  return normalized;
}

/**
 * True when `path` is exactly one comic folder under the current comics sandbox
 * (e.g. `…/comics/c_abc/`). Rejects the sandbox root, parents, and outside paths.
 */
export function isSafeComicDeleteRoot(path: string): boolean {
  let root: string;
  try {
    root = comicsRoot();
  } catch {
    return false;
  }
  const sandbox = withTrailingSlash(root);
  const candidate = withTrailingSlash(path);
  if (!candidate.startsWith(sandbox) || candidate === sandbox) return false;
  const rest = candidate.slice(sandbox.length).replace(/\/$/, '');
  if (!rest || rest.includes('..') || rest.includes('/')) return false;
  return true;
}

/** Absolute `comics/<id>/` folder, verified safe for recursive delete. */
export function comicSandboxDir(comicId: string): string {
  const id = comicId.trim();
  if (!id || id.includes('/') || id.includes('\\') || id.includes('..')) {
    throw new Error('Invalid comic id for sandbox delete.');
  }
  const path = `${comicsRoot()}${id}/`;
  if (!isSafeComicDeleteRoot(path)) {
    throw new Error('Refusing to delete path outside the comics library sandbox.');
  }
  return path;
}
