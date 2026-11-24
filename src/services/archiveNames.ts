/**
 * Archive filename helpers for import + duplicate detection.
 * Always normalize in JS (not SQLite lower()) so Unicode case-folding stays consistent.
 */

/** decodeURIComponent that never throws on malformed `%` sequences. */
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Case-folded key used to detect already-imported archives. */
export function normalizeArchiveName(name: string): string {
  return name.trim().toLowerCase();
}

/** Last path segment of a URI or filesystem path (SAF-safe). */
export function archiveBasename(uriOrPath: string): string {
  const decoded = safeDecodeURIComponent(uriOrPath);
  const parts = decoded.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || '';
}

/** Normalized basename for duplicate checks. */
export function archiveNameKey(uriOrName: string): string {
  return normalizeArchiveName(archiveBasename(uriOrName));
}
